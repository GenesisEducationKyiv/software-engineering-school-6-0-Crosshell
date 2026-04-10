import { getChannel } from '@/infrastructure/queue';
import { logger } from '@/shared/logger';
import { ReleaseNotificationPayload } from '@/modules/notification/notification.schemas';

const QUEUE_NAME = 'release.notifications';

export async function setupNotificationQueue(): Promise<void> {
  await getChannel().assertQueue(QUEUE_NAME, { durable: true });
}

export function publishReleaseNotification(
  payload: ReleaseNotificationPayload,
): void {
  getChannel().sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(payload)), {
    persistent: true,
  });
}

export function consumeReleaseNotifications(
  handler: (payload: ReleaseNotificationPayload) => Promise<void>,
): void {
  const channel = getChannel();

  void channel.consume(QUEUE_NAME, async (msg) => {
    if (!msg) return;

    try {
      const payload = JSON.parse(
        msg.content.toString(),
      ) as ReleaseNotificationPayload;
      await handler(payload);
      channel.ack(msg);
    } catch (err) {
      logger.error({ err }, '[Queue] Failed to process message');
      channel.nack(msg, false, false);
    }
  });
}
