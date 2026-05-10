import type { Channel, ConsumeMessage } from 'amqplib';
import type { QueueManager } from '@/infrastructure/queue/queue-manager';
import { logger } from '@/shared/logger';
import type { ReleaseNotificationPayload } from '@/modules/notification/notification.schemas';
import { releaseNotificationPayloadSchema } from '@/modules/notification/notification.schemas';
import type { INotificationPublisher } from './notification-publisher.interface';
import type { INotificationConsumer } from './notification.consumer.interface';

const QUEUE_NAME = 'release.notifications';
const DLX_NAME = 'release.notifications.dlx';
const DLQ_NAME = 'release.notifications.dead';
const MAX_RETRIES = 3;

export class NotificationQueue
  implements INotificationPublisher, INotificationConsumer
{
  constructor(private readonly queueManager: QueueManager) {}

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
  }

  publish(payload: ReleaseNotificationPayload): void {
    const ok = this.queueManager
      .getChannel()
      .sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(payload)), {
        persistent: true,
      });
    if (!ok) {
      logger.warn(
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
      if (!msg) return;

      void (async () => {
        try {
          const payload = releaseNotificationPayloadSchema.parse(
            JSON.parse(msg.content.toString()),
          );
          await handler(payload);
          channel.ack(msg);
        } catch (err) {
          this.handleRetry(channel, msg, err);
        }
      })();
    });
  }

  private handleRetry(
    channel: Channel,
    msg: ConsumeMessage,
    err: unknown,
  ): void {
    const retryCount =
      (msg.properties.headers?.['x-retry-count'] as number | undefined) ?? 0;

    logger.error({ err, retryCount }, '[Queue] Failed to process message');

    if (retryCount < MAX_RETRIES) {
      channel.sendToQueue(QUEUE_NAME, msg.content, {
        persistent: true,
        headers: { 'x-retry-count': retryCount + 1 },
      });
      channel.ack(msg);
    } else {
      logger.error({ err }, '[Queue] Max retries reached. Sending to DLQ');
      channel.nack(msg, false, false);
    }
  }
}
