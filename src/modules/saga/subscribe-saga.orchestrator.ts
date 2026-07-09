import { randomUUID } from 'node:crypto';
import type { IUnitOfWork } from '@/infrastructure/database/unit-of-work';
import type { IRepositorySource, SubscribeInput } from '@/modules/subscription';
import { ConflictError } from '@/shared/errors/app.errors';
import { isUniqueConstraintError } from '@/infrastructure/database/helpers/pg-errors.helper';
import {
  buildConfirmUrl,
  buildUnsubscribeUrl,
} from '@/shared/utils/url-builders';
import type { SagaCommandsQueue } from '@/infrastructure/queue/saga-commands.queue';
import type { ISagaRepository } from './interfaces/saga.repository.interface';
import type { SagaReply, SagaStatus } from './saga.types';
import type { ILogger } from '@/shared/logger/logger.interface';
import type { SubscribeSagaUoWContext } from './subscribe-saga.uow-context.builder';

export interface SubscribeSagaConfig {
  appUrl: string;
  replyTimeoutMs?: number;
}

export class SubscribeSagaOrchestrator {
  private static readonly DEFAULT_TIMEOUT_MS = 30_000;
  private readonly pendingReplies = new Map<
    string,
    (reply: SagaReply) => void
  >();

  constructor(
    private readonly uow: IUnitOfWork<SubscribeSagaUoWContext>,
    private readonly repositorySource: IRepositorySource,
    private readonly sagaCommandsQueue: SagaCommandsQueue,
    private readonly sagaRepository: ISagaRepository,
    private readonly logger: ILogger,
    private readonly config: SubscribeSagaConfig,
  ) {}

  startReplyConsumer(): void {
    this.sagaCommandsQueue.consumeReplies(async (reply) => {
      const resolver = this.pendingReplies.get(reply.correlationId);
      if (resolver) {
        this.pendingReplies.delete(reply.correlationId);
        resolver(reply);
      } else {
        this.logger.warn(
          { correlationId: reply.correlationId },
          '[Saga] Received reply for unknown or expired correlationId',
        );
      }
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
        await this.compensate(saga.correlationId, saga.payload.subscriptionId);
      }
    }
  }

  async execute(input: SubscribeInput): Promise<void> {
    const { owner, repo } = await this.repositorySource.getRepository(
      input.repo,
    );

    const correlationId = randomUUID();

    const { subscriptionId, confirmUrl, unsubscribeUrl } = await this.uow.run(
      async ({ repositories, subscriptions, sagaInstances }) => {
        const repository = await repositories.findOrCreate(owner, repo);

        let sub;
        try {
          sub = await subscriptions.createSubscription({
            email: input.email,
            repositoryId: repository.id,
          });
        } catch (err) {
          if (isUniqueConstraintError(err)) {
            throw new ConflictError(
              'Email is already subscribed to this repository',
            );
          }
          throw err;
        }

        const confirmUrl = buildConfirmUrl(
          sub.confirmToken,
          this.config.appUrl,
        );
        const unsubscribeUrl = buildUnsubscribeUrl(
          sub.unsubscribeToken,
          this.config.appUrl,
        );

        await sagaInstances.create({
          correlationId,
          type: 'SUBSCRIBE',
          status: 'SUBSCRIPTION_CREATED',
          payload: {
            subscriptionId: sub.id,
            email: input.email,
            confirmUrl,
            unsubscribeUrl,
          },
        });

        return { subscriptionId: sub.id, confirmUrl, unsubscribeUrl };
      },
    );

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

  private async compensate(
    correlationId: string,
    subscriptionId: string,
  ): Promise<void> {
    await this.sagaRepository.updateStatus(correlationId, 'COMPENSATING');

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
