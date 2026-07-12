import type { Channel, ConsumeMessage } from 'amqplib';
import type { QueueManager } from '@/infrastructure/queue/queue-manager';
import type { ILogger } from '@/shared/logger/logger.interface';
import type { ReleaseNotificationPayload } from './notification.schemas';
import { releaseNotificationPayloadSchema } from './notification.schemas';
import type { INotificationPublisher } from './interfaces/notification-publisher.interface';
import type { INotificationConsumer } from './interfaces/notification.consumer.interface';
import {
  QUEUE_NAME,
  DLX_NAME,
  DLQ_NAME,
  RETRY_QUEUE_NAME,
  MAX_RETRIES,
  RETRY_DELAYS_MS,
} from './notification.constants';

export class NotificationQueue
  implements INotificationPublisher, INotificationConsumer
{
  constructor(
    private readonly queueManager: QueueManager,
    private readonly logger: ILogger,
  ) {}

  async setup(): Promise<void> {
    const ch = this.queueManager.getChannel();
    await ch.assertExchange(DLX_NAME, 'direct', { durable: true });
    await ch.assertQueue(DLQ_NAME, { durable: true });
    await ch.bindQueue(DLQ_NAME, DLX_NAME, QUEUE_NAME);

    await ch.assertQueue(QUEUE_NAME, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': DLX_NAME,
        'x-dead-letter-routing-key': QUEUE_NAME,
      },
    });

    await ch.assertQueue(RETRY_QUEUE_NAME, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': QUEUE_NAME,
      },
    });
  }

  publish(payload: ReleaseNotificationPayload): void {
    const ok = this.queueManager
      .getChannel()
      .sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(payload)), {
        persistent: true,
      });
    if (!ok) {
      this.logger.warn(
        { repo: `${payload.repositoryOwner}/${payload.repositoryRepo}` },
        '[Queue] sendToQueue returned false. Channel write buffer is full',
      );
    }
  }

  consume(
    handler: (payload: ReleaseNotificationPayload) => Promise<void>,
  ): void {
    const channel = this.queueManager.getChannel();
    void channel.consume(QUEUE_NAME, (msg) => {
      if (!msg) {
        return;
      }
      void this.processMessage(channel, msg, handler);
    });
  }

  private async processMessage(
    channel: Channel,
    msg: ConsumeMessage,
    handler: (payload: ReleaseNotificationPayload) => Promise<void>,
  ): Promise<void> {
    let payload: ReleaseNotificationPayload;
    try {
      payload = releaseNotificationPayloadSchema.parse(
        JSON.parse(msg.content.toString()),
      );
    } catch (err) {
      this.logger.error(
        { err },
        '[Queue] Invalid message payload. Sending to DLQ',
      );
      channel.nack(msg, false, false);

      return;
    }

    try {
      await handler(payload);
      channel.ack(msg);
    } catch (err) {
      this.handleRetry(channel, msg, err);
    }
  }

  private handleRetry(
    channel: Channel,
    msg: ConsumeMessage,
    err: unknown,
  ): void {
    const retryCount =
      (msg.properties.headers?.['x-retry-count'] as number | undefined) ?? 0;

    this.logger.error({ err, retryCount }, '[Queue] Failed to process message');

    if (retryCount >= MAX_RETRIES) {
      this.logger.error({ err }, '[Queue] Max retries reached. Sending to DLQ');
      channel.nack(msg, false, false);

      return;
    }

    const delayMs =
      RETRY_DELAYS_MS[Math.min(retryCount, RETRY_DELAYS_MS.length - 1)];

    const ok = channel.sendToQueue(RETRY_QUEUE_NAME, msg.content, {
      persistent: true,
      headers: { 'x-retry-count': retryCount + 1 },
      expiration: String(delayMs),
    });
    if (!ok) {
      this.logger.warn(
        '[Queue] sendToQueue returned false during retry. Channel write buffer is full',
      );
    }
    channel.ack(msg);
  }
}
