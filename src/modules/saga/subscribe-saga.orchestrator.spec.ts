import { describe, it, expect, beforeEach } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import { SubscribeSagaOrchestrator } from './subscribe-saga.orchestrator';
import type { CreateSubscriptionStep } from './subscribe-saga.create-subscription.step';
import type { IUnitOfWork } from '@/infrastructure/database/unit-of-work';
import type { SubscribeSagaUoWContext } from './subscribe-saga.uow-context.builder';
import type { ISagaRepository } from './interfaces/saga.repository.interface';
import type { ILogger } from '@/shared/logger/logger.interface';
import type { SubscribeInput, Subscription } from '@/modules/subscription';
import type { SagaInstance } from './saga.types';
import type { SagaCommandsQueue, SagaReply } from '@/modules/saga-queue';

const VALID_INPUT: SubscribeInput = {
  email: 'user@example.com',
  repo: 'owner/repo',
};

const MOCK_SUBSCRIPTION: Subscription = {
  id: 'sub-uuid-1',
  email: 'user@example.com',
  repositoryId: 'repo-uuid-1',
  confirmed: false,
  confirmToken: 'confirm-token',
  unsubscribeToken: 'unsub-token',
};

const CREATE_SUBSCRIPTION_RESULT = {
  subscriptionId: MOCK_SUBSCRIPTION.id,
  confirmUrl: 'http://localhost/confirm.html?token=confirm-token',
  unsubscribeUrl: 'http://localhost/unsubscribe.html?token=unsub-token',
};

const REPLY_TIMEOUT_MS = 30;

describe('SubscribeSagaOrchestrator', () => {
  let orchestrator: SubscribeSagaOrchestrator;
  let uow: ReturnType<typeof mock<IUnitOfWork<SubscribeSagaUoWContext>>>;
  let txCtx: ReturnType<typeof mockDeep<SubscribeSagaUoWContext>>;
  let createSubscriptionStep: ReturnType<typeof mock<CreateSubscriptionStep>>;
  let sagaCommandsQueue: ReturnType<typeof mock<SagaCommandsQueue>>;
  let sagaRepository: ReturnType<typeof mock<ISagaRepository>>;
  let replyHandler: (reply: SagaReply) => Promise<void>;

  beforeEach(() => {
    txCtx = mockDeep<SubscribeSagaUoWContext>();
    txCtx.subscriptions.deleteById.mockResolvedValue(undefined);
    txCtx.sagaInstances.updateStatus.mockResolvedValue(undefined);

    uow = mock<IUnitOfWork<SubscribeSagaUoWContext>>();
    uow.run.mockImplementation((fn) => fn(txCtx));

    createSubscriptionStep = mock<CreateSubscriptionStep>();
    createSubscriptionStep.execute.mockResolvedValue(
      CREATE_SUBSCRIPTION_RESULT,
    );

    sagaRepository = mock<ISagaRepository>();
    sagaRepository.updateStatus.mockResolvedValue(undefined);
    sagaRepository.findByStatus.mockResolvedValue([]);
    sagaRepository.findByCorrelationId.mockResolvedValue(null);
    sagaRepository.updateStatusIfCurrent.mockResolvedValue(true);

    sagaCommandsQueue = mock<SagaCommandsQueue>();
    sagaCommandsQueue.consumeReplies.mockImplementation((handler) => {
      replyHandler = handler;
    });

    orchestrator = new SubscribeSagaOrchestrator(
      uow,
      createSubscriptionStep,
      sagaCommandsQueue,
      sagaRepository,
      mock<ILogger>(),
      { appUrl: 'http://localhost', replyTimeoutMs: REPLY_TIMEOUT_MS },
    );
    orchestrator.startReplyConsumer();
  });

  describe('execute — happy path', () => {
    beforeEach(() => {
      sagaCommandsQueue.publishCommand.mockImplementation((cmd) => {
        void replyHandler({
          correlationId: cmd.correlationId,
          type: 'SEND_CONFIRMATION_EMAIL_SUCCESS',
        });
      });
    });

    it('passes the input and a fresh correlationId to the create-subscription step', async () => {
      await orchestrator.execute(VALID_INPUT);

      expect(createSubscriptionStep.execute).toHaveBeenCalledWith(
        VALID_INPUT,
        expect.any(String),
      );
    });

    it('marks saga AWAITING_EMAIL after publishing command', async () => {
      await orchestrator.execute(VALID_INPUT);

      expect(sagaRepository.updateStatus).toHaveBeenCalledWith(
        expect.any(String),
        'AWAITING_EMAIL',
      );
    });

    it('marks saga COMPLETED after success reply', async () => {
      await orchestrator.execute(VALID_INPUT);

      expect(sagaRepository.updateStatus).toHaveBeenCalledWith(
        expect.any(String),
        'COMPLETED',
      );
    });

    it('does not touch subscriptions.deleteById on success', async () => {
      await orchestrator.execute(VALID_INPUT);

      expect(txCtx.subscriptions.deleteById).not.toHaveBeenCalled();
    });
  });

  describe('execute — compensation on timeout', () => {
    beforeEach(() => {
      sagaCommandsQueue.publishCommand.mockImplementation(() => {});
    });

    it('rejects with a timeout error', async () => {
      await expect(orchestrator.execute(VALID_INPUT)).rejects.toThrow(
        'timeout',
      );
    });

    it('deletes the subscription on timeout', async () => {
      await expect(orchestrator.execute(VALID_INPUT)).rejects.toThrow();

      expect(txCtx.subscriptions.deleteById).toHaveBeenCalledWith(
        MOCK_SUBSCRIPTION.id,
      );
    });

    it('transitions saga through COMPENSATING → COMPENSATED atomically on timeout', async () => {
      await expect(orchestrator.execute(VALID_INPUT)).rejects.toThrow();

      expect(sagaRepository.updateStatus).toHaveBeenCalledWith(
        expect.any(String),
        'COMPENSATING',
      );
      expect(txCtx.sagaInstances.updateStatus).toHaveBeenCalledWith(
        expect.any(String),
        'COMPENSATED',
      );
    });
  });

  describe('execute — compensation on FAILURE reply', () => {
    beforeEach(() => {
      sagaCommandsQueue.publishCommand.mockImplementation((cmd) => {
        void replyHandler({
          correlationId: cmd.correlationId,
          type: 'SEND_CONFIRMATION_EMAIL_FAILURE',
          error: 'SMTP unavailable',
        });
      });
    });

    it('rejects when notifier replies with FAILURE', async () => {
      await expect(orchestrator.execute(VALID_INPUT)).rejects.toThrow();
    });

    it('deletes the subscription on FAILURE reply', async () => {
      await expect(orchestrator.execute(VALID_INPUT)).rejects.toThrow();

      expect(txCtx.subscriptions.deleteById).toHaveBeenCalledWith(
        MOCK_SUBSCRIPTION.id,
      );
    });

    it('does not mark saga COMPLETED on FAILURE reply', async () => {
      await expect(orchestrator.execute(VALID_INPUT)).rejects.toThrow();

      const statuses = sagaRepository.updateStatus.mock.calls.map((c) => c[1]);
      expect(statuses).not.toContain('COMPLETED');
    });
  });

  describe('execute — compensation on publish error', () => {
    beforeEach(() => {
      sagaCommandsQueue.publishCommand.mockImplementation(() => {
        throw new Error('RabbitMQ write buffer full');
      });
    });

    it('rejects when publishing command throws', async () => {
      await expect(orchestrator.execute(VALID_INPUT)).rejects.toThrow();
    });

    it('deletes the subscription when command publish fails', async () => {
      await expect(orchestrator.execute(VALID_INPUT)).rejects.toThrow();

      expect(txCtx.subscriptions.deleteById).toHaveBeenCalledWith(
        MOCK_SUBSCRIPTION.id,
      );
    });
  });

  describe('recoverPendingSagas', () => {
    it('compensates AWAITING_EMAIL sagas left by a previous crash', async () => {
      const stuckSaga: SagaInstance = {
        id: 'saga-id-1',
        correlationId: 'corr-1',
        type: 'SUBSCRIBE',
        status: 'AWAITING_EMAIL',
        payload: {
          subscriptionId: 'sub-stuck-1',
          email: 'a@b.com',
          confirmUrl: 'http://x/confirm',
          unsubscribeUrl: 'http://x/unsub',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      sagaRepository.findByStatus.mockImplementation(async (status) =>
        status === 'AWAITING_EMAIL' ? [stuckSaga] : [],
      );

      await orchestrator.recoverPendingSagas();

      expect(sagaRepository.updateStatusIfCurrent).toHaveBeenCalledWith(
        'corr-1',
        'COMPENSATING',
        ['AWAITING_EMAIL'],
      );
      expect(txCtx.subscriptions.deleteById).toHaveBeenCalledWith(
        'sub-stuck-1',
      );
      expect(txCtx.sagaInstances.updateStatus).toHaveBeenCalledWith(
        'corr-1',
        'COMPENSATED',
      );
    });

    it('retries COMPENSATING sagas to make compensation idempotent', async () => {
      const partialSaga: SagaInstance = {
        id: 'saga-id-2',
        correlationId: 'corr-2',
        type: 'SUBSCRIBE',
        status: 'COMPENSATING',
        payload: {
          subscriptionId: 'sub-stuck-2',
          email: 'x@y.com',
          confirmUrl: 'http://x/confirm',
          unsubscribeUrl: 'http://x/unsub',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      sagaRepository.findByStatus.mockImplementation(async (status) =>
        status === 'COMPENSATING' ? [partialSaga] : [],
      );

      await orchestrator.recoverPendingSagas();

      expect(txCtx.subscriptions.deleteById).toHaveBeenCalledWith(
        'sub-stuck-2',
      );
      expect(txCtx.sagaInstances.updateStatus).toHaveBeenCalledWith(
        'corr-2',
        'COMPENSATED',
      );
    });

    it('does nothing when no stuck sagas exist', async () => {
      sagaRepository.findByStatus.mockResolvedValue([]);

      await orchestrator.recoverPendingSagas();

      expect(txCtx.subscriptions.deleteById).not.toHaveBeenCalled();
    });

    it('skips compensation when a reply already resolved the saga concurrently', async () => {
      const stuckSaga: SagaInstance = {
        id: 'saga-id-3',
        correlationId: 'corr-3',
        type: 'SUBSCRIBE',
        status: 'AWAITING_EMAIL',
        payload: {
          subscriptionId: 'sub-stuck-3',
          email: 'a@b.com',
          confirmUrl: 'http://x/confirm',
          unsubscribeUrl: 'http://x/unsub',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      sagaRepository.findByStatus.mockImplementation(async (status) =>
        status === 'AWAITING_EMAIL' ? [stuckSaga] : [],
      );

      sagaRepository.updateStatusIfCurrent.mockResolvedValue(false);

      await orchestrator.recoverPendingSagas();

      expect(txCtx.subscriptions.deleteById).not.toHaveBeenCalled();
      expect(txCtx.sagaInstances.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('startReplyConsumer — reply with no live resolver (post-restart)', () => {
    it('ignores replies for a correlationId with no saga record', async () => {
      sagaRepository.findByCorrelationId.mockResolvedValue(null);

      await replyHandler({
        correlationId: 'unknown-corr',
        type: 'SEND_CONFIRMATION_EMAIL_SUCCESS',
      });

      expect(sagaRepository.updateStatusIfCurrent).not.toHaveBeenCalled();
    });

    it('completes a saga stuck in AWAITING_EMAIL when a queued success reply arrives', async () => {
      const stuckSaga: SagaInstance = {
        id: 'saga-id-4',
        correlationId: 'corr-4',
        type: 'SUBSCRIBE',
        status: 'AWAITING_EMAIL',
        payload: {
          subscriptionId: 'sub-stuck-4',
          email: 'a@b.com',
          confirmUrl: 'http://x/confirm',
          unsubscribeUrl: 'http://x/unsub',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      sagaRepository.findByCorrelationId.mockResolvedValue(stuckSaga);

      await replyHandler({
        correlationId: 'corr-4',
        type: 'SEND_CONFIRMATION_EMAIL_SUCCESS',
      });

      expect(sagaRepository.updateStatusIfCurrent).toHaveBeenCalledWith(
        'corr-4',
        'COMPLETED',
        ['AWAITING_EMAIL'],
      );
      expect(txCtx.subscriptions.deleteById).not.toHaveBeenCalled();
    });

    it('compensates a saga stuck in AWAITING_EMAIL when a queued failure reply arrives', async () => {
      const stuckSaga: SagaInstance = {
        id: 'saga-id-5',
        correlationId: 'corr-5',
        type: 'SUBSCRIBE',
        status: 'AWAITING_EMAIL',
        payload: {
          subscriptionId: 'sub-stuck-5',
          email: 'a@b.com',
          confirmUrl: 'http://x/confirm',
          unsubscribeUrl: 'http://x/unsub',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      sagaRepository.findByCorrelationId.mockResolvedValue(stuckSaga);

      await replyHandler({
        correlationId: 'corr-5',
        type: 'SEND_CONFIRMATION_EMAIL_FAILURE',
        error: 'SMTP unavailable',
      });

      expect(txCtx.subscriptions.deleteById).toHaveBeenCalledWith(
        'sub-stuck-5',
      );
      expect(txCtx.sagaInstances.updateStatus).toHaveBeenCalledWith(
        'corr-5',
        'COMPENSATED',
      );
    });

    it('ignores a reply for a saga that already reached a terminal status', async () => {
      const completedSaga: SagaInstance = {
        id: 'saga-id-6',
        correlationId: 'corr-6',
        type: 'SUBSCRIBE',
        status: 'COMPLETED',
        payload: {
          subscriptionId: 'sub-6',
          email: 'a@b.com',
          confirmUrl: 'http://x/confirm',
          unsubscribeUrl: 'http://x/unsub',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      sagaRepository.findByCorrelationId.mockResolvedValue(completedSaga);

      await replyHandler({
        correlationId: 'corr-6',
        type: 'SEND_CONFIRMATION_EMAIL_SUCCESS',
      });

      expect(sagaRepository.updateStatusIfCurrent).not.toHaveBeenCalled();
    });
  });
});
