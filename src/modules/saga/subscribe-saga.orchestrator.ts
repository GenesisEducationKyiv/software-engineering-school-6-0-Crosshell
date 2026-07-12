import { randomUUID } from 'node:crypto';
import type { IUnitOfWork } from '@/infrastructure/database/unit-of-work';
import type {
  ISubscribeOrchestrator,
  SubscribeInput,
} from '@/modules/subscription';
import type { ISagaCommandsQueue } from './interfaces/saga-commands-queue.interface';
import type { SagaReply } from '@/modules/saga-queue';
import type { CreateSubscriptionStep } from './subscribe-saga.create-subscription.step';
import type { ISagaRepository } from './interfaces/saga.repository.interface';
import type { SagaStatus } from './saga.types';
import type { ILogger } from '@/shared/logger/logger.interface';
import type { SubscribeSagaUoWContext } from './subscribe-saga.uow-context.builder';
import {
  AmbiguousConfirmationEmailError,
  type IConfirmationEmailSender,
} from './interfaces/confirmation-email-sender.interface';

export type ConfirmationEmailTransport = 'queue' | 'grpc';

export interface SubscribeSagaConfig {
  appUrl: string;
  replyTimeoutMs?: number;
  transport?: ConfirmationEmailTransport;
}

export class SubscribeSagaOrchestrator implements ISubscribeOrchestrator {
  private static readonly DEFAULT_TIMEOUT_MS = 30_000;
  private readonly pendingReplies = new Map<
    string,
    (reply: SagaReply) => void
  >();

  constructor(
    private readonly uow: IUnitOfWork<SubscribeSagaUoWContext>,
    private readonly createSubscriptionStep: CreateSubscriptionStep,
    private readonly sagaCommandsQueue: ISagaCommandsQueue,
    private readonly sagaRepository: ISagaRepository,
    private readonly logger: ILogger,
    private readonly config: SubscribeSagaConfig,
    private readonly confirmationEmailSender?: IConfirmationEmailSender,
  ) {
    if (config.transport === 'grpc' && !confirmationEmailSender) {
      throw new Error(
        'SubscribeSagaOrchestrator: transport is "grpc" but no confirmationEmailSender was provided',
      );
    }
  }

  startReplyConsumer(): void {
    this.sagaCommandsQueue.consumeReplies(async (reply) => {
      const resolver = this.pendingReplies.get(reply.correlationId);
      if (resolver) {
        this.pendingReplies.delete(reply.correlationId);
        resolver(reply);

        return;
      }

      await this.resolveOrphanedReply(reply);
    });
  }

  async recoverPendingSagas(): Promise<void> {
    const statusesToRecover: SagaStatus[] = ['AWAITING_EMAIL', 'COMPENSATING'];
    for (const status of statusesToRecover) {
      const sagas = await this.sagaRepository.findByStatus(status);
      for (const saga of sagas) {
        this.logger.warn(
          { correlationId: saga.correlationId, status },
          '[Saga] Recovering stuck saga — compensating',
        );
        await this.compensate(saga.correlationId, saga.payload.subscriptionId, [
          status,
        ]);
      }
    }
  }

  private async resolveOrphanedReply(reply: SagaReply): Promise<void> {
    const saga = await this.sagaRepository.findByCorrelationId(
      reply.correlationId,
    );
    if (!saga || saga.status !== 'AWAITING_EMAIL') {
      this.logger.warn(
        { correlationId: reply.correlationId },
        '[Saga] Received reply for unknown or already-resolved correlationId',
      );

      return;
    }

    if (reply.type === 'SEND_CONFIRMATION_EMAIL_SUCCESS') {
      const completed = await this.sagaRepository.updateStatusIfCurrent(
        reply.correlationId,
        'COMPLETED',
        ['AWAITING_EMAIL'],
      );
      if (completed) {
        this.logger.info(
          { correlationId: reply.correlationId },
          '[Saga] Recovered success reply after restart — saga completed',
        );
      }

      return;
    }

    this.logger.warn(
      { correlationId: reply.correlationId, error: reply.error },
      '[Saga] Recovered failure reply after restart — compensating',
    );
    await this.compensate(reply.correlationId, saga.payload.subscriptionId, [
      'AWAITING_EMAIL',
    ]);
  }

  async execute(input: SubscribeInput): Promise<void> {
    const correlationId = randomUUID();

    const { subscriptionId, confirmUrl, unsubscribeUrl } =
      await this.createSubscriptionStep.execute(input, correlationId);

    if (this.config.transport === 'grpc') {
      await this.executeGrpc(
        correlationId,
        subscriptionId,
        input.email,
        confirmUrl,
        unsubscribeUrl,
      );

      return;
    }

    const { promise: replyPromise, cancel: cancelReply } =
      this.waitForReply(correlationId);

    try {
      this.sagaCommandsQueue.publishCommand({
        type: 'SEND_CONFIRMATION_EMAIL',
        correlationId,
        payload: { email: input.email, confirmUrl, unsubscribeUrl },
      });
    } catch (err) {
      cancelReply();
      this.logger.error(
        { correlationId, err },
        '[Saga] Failed to publish command — compensating',
      );
      await this.compensate(correlationId, subscriptionId);
      throw new Error('Subscription failed: could not dispatch email command', {
        cause: err,
      });
    }

    await this.sagaRepository.updateStatus(correlationId, 'AWAITING_EMAIL');

    let reply: SagaReply;
    try {
      reply = await replyPromise;
    } catch {
      this.logger.error(
        { correlationId },
        '[Saga] Timeout waiting for confirmation email reply — compensating',
      );
      await this.compensate(correlationId, subscriptionId);
      throw new Error(
        'Subscription failed: timeout sending confirmation email',
      );
    }

    if (reply.type === 'SEND_CONFIRMATION_EMAIL_SUCCESS') {
      await this.sagaRepository.updateStatus(correlationId, 'COMPLETED');
      this.logger.info({ correlationId }, '[Saga] Subscribe saga completed');
    } else {
      this.logger.error(
        { correlationId, error: reply.error },
        '[Saga] Confirmation email failed — compensating',
      );
      await this.compensate(correlationId, subscriptionId);
      throw new Error('Subscription failed: could not send confirmation email');
    }
  }

  private async executeGrpc(
    correlationId: string,
    subscriptionId: string,
    email: string,
    confirmUrl: string,
    unsubscribeUrl: string,
  ): Promise<void> {
    const confirmationEmailSender = this.confirmationEmailSender!;

    await this.sagaRepository.updateStatus(correlationId, 'AWAITING_EMAIL');

    try {
      await confirmationEmailSender.send({
        correlationId,
        email,
        confirmUrl,
        unsubscribeUrl,
      });
    } catch (err) {
      if (err instanceof AmbiguousConfirmationEmailError) {
        this.logger.warn(
          { correlationId, err },
          '[Saga] gRPC confirmation email outcome unknown — leaving saga pending, not compensating',
        );
        throw new Error(
          'Subscription pending: confirmation email outcome unknown',
          { cause: err },
        );
      }

      this.logger.error(
        { correlationId, err },
        '[Saga] gRPC confirmation email failed — compensating',
      );
      await this.compensate(correlationId, subscriptionId);
      throw new Error(
        'Subscription failed: could not send confirmation email',
        {
          cause: err,
        },
      );
    }

    await this.sagaRepository.updateStatus(correlationId, 'COMPLETED');
    this.logger.info(
      { correlationId },
      '[Saga] Subscribe saga completed (grpc)',
    );
  }

  private async compensate(
    correlationId: string,
    subscriptionId: string,
    expectedStatuses?: SagaStatus[],
  ): Promise<void> {
    if (expectedStatuses) {
      const transitioned = await this.sagaRepository.updateStatusIfCurrent(
        correlationId,
        'COMPENSATING',
        expectedStatuses,
      );
      if (!transitioned) {
        this.logger.info(
          { correlationId },
          '[Saga] Skipping compensation — saga already resolved elsewhere',
        );

        return;
      }
    } else {
      await this.sagaRepository.updateStatus(correlationId, 'COMPENSATING');
    }

    await this.uow.run(async ({ subscriptions, sagaInstances }) => {
      await subscriptions.deleteById(subscriptionId);
      await sagaInstances.updateStatus(correlationId, 'COMPENSATED');
    });
    this.logger.info(
      { correlationId, subscriptionId },
      '[Saga] Compensation complete — subscription deleted',
    );
  }

  private waitForReply(correlationId: string): {
    promise: Promise<SagaReply>;
    cancel: () => void;
  } {
    const timeoutMs =
      this.config.replyTimeoutMs ??
      SubscribeSagaOrchestrator.DEFAULT_TIMEOUT_MS;

    let timeoutHandle: ReturnType<typeof setTimeout>;

    const promise = new Promise<SagaReply>((resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        this.pendingReplies.delete(correlationId);
        reject(
          new Error(`Saga reply timeout for correlationId=${correlationId}`),
        );
      }, timeoutMs);

      this.pendingReplies.set(correlationId, (reply) => {
        clearTimeout(timeoutHandle);
        resolve(reply);
      });
    });

    const cancel = (): void => {
      clearTimeout(timeoutHandle!);
      this.pendingReplies.delete(correlationId);
    };

    return { promise, cancel };
  }
}
