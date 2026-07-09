import { describe, it, expect, beforeEach } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import { SubscribeSagaOrchestrator } from './subscribe-saga.orchestrator';
import type { IUnitOfWork } from '@/infrastructure/database/unit-of-work';
import type { SubscribeSagaUoWContext } from './subscribe-saga.uow-context.builder';
import type { SagaCommandsQueue } from '@/infrastructure/queue/saga-commands.queue';
import type { ISagaRepository } from './interfaces/saga.repository.interface';
import type { ILogger } from '@/shared/logger/logger.interface';
import type {
  IRepositorySource,
  SubscribeInput,
  Subscription,
} from '@/modules/subscription';
import type { SagaInstance, SagaReply } from './saga.types';
import type { Repository } from '@/modules/repository';

const VALID_INPUT: SubscribeInput = {
  email: 'user@example.com',
  repo: 'owner/repo',
};

const MOCK_REPOSITORY: Repository = {
  id: 'repo-uuid-1',
  owner: 'owner',
  repo: 'repo',
  lastSeenTag: null,
};

const MOCK_SUBSCRIPTION: Subscription = {
  id: 'sub-uuid-1',
  email: 'user@example.com',
  repositoryId: 'repo-uuid-1',
  confirmed: false,
  confirmToken: 'confirm-token',
  unsubscribeToken: 'unsub-token',
};

const REPLY_TIMEOUT_MS = 30;

describe('SubscribeSagaOrchestrator', () => {
  let orchestrator: SubscribeSagaOrchestrator;
  let uow: ReturnType<typeof mock<IUnitOfWork<SubscribeSagaUoWContext>>>;
  let txCtx: ReturnType<typeof mockDeep<SubscribeSagaUoWContext>>;
  let repositorySource: ReturnType<typeof mock<IRepositorySource>>;
  let sagaCommandsQueue: ReturnType<typeof mock<SagaCommandsQueue>>;
  let sagaRepository: ReturnType<typeof mock<ISagaRepository>>;
  let replyHandler: (reply: SagaReply) => Promise<void>;

  beforeEach(() => {
    txCtx = mockDeep<SubscribeSagaUoWContext>();
    txCtx.repositories.findOrCreate.mockResolvedValue(MOCK_REPOSITORY);
    txCtx.subscriptions.createSubscription.mockResolvedValue(MOCK_SUBSCRIPTION);
    txCtx.sagaInstances.create.mockResolvedValue(undefined);
    txCtx.subscriptions.deleteById.mockResolvedValue(undefined);
    txCtx.sagaInstances.updateStatus.mockResolvedValue(undefined);

    uow = mock<IUnitOfWork<SubscribeSagaUoWContext>>();
    uow.run.mockImplementation((fn) => fn(txCtx));

    repositorySource = mock<IRepositorySource>();
    repositorySource.getRepository.mockResolvedValue({
      owner: 'owner',
      repo: 'repo',
    });

    sagaRepository = mock<ISagaRepository>();
    sagaRepository.updateStatus.mockResolvedValue(undefined);
    sagaRepository.findByStatus.mockResolvedValue([]);

    sagaCommandsQueue = mock<SagaCommandsQueue>();
    sagaCommandsQueue.consumeReplies.mockImplementation((handler) => {
      replyHandler = handler;
    });

    orchestrator = new SubscribeSagaOrchestrator(
      uow,
      repositorySource,
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

    it('creates subscription and saga instance inside the same UoW.run call', async () => {
      let subCreatedInTx = false;
      let sagaCreatedInTx = false;

      uow.run.mockImplementationOnce(async (fn) => {
        const innerCtx = mockDeep<SubscribeSagaUoWContext>();
        innerCtx.repositories.findOrCreate.mockResolvedValue(MOCK_REPOSITORY);
        innerCtx.subscriptions.createSubscription.mockImplementation(
          async () => {
            subCreatedInTx = true;

            return MOCK_SUBSCRIPTION;
          },
        );
        innerCtx.sagaInstances.create.mockImplementation(async () => {
          sagaCreatedInTx = true;
        });

        return fn(innerCtx);
      });

      await orchestrator.execute(VALID_INPUT);

      expect(subCreatedInTx).toBe(true);
      expect(sagaCreatedInTx).toBe(true);
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

      expect(sagaRepository.updateStatus).toHaveBeenCalledWith(
        'corr-1',
        'COMPENSATING',
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
  });
});
