import type { Channel } from 'amqplib';
import {
  releaseNotificationPayloadSchema,
  type ReleaseNotificationPayload,
} from '@/modules/notification/notification.schemas';

const QUEUE_NAME = 'release.notifications';

export async function purgeNotificationQueue(channel: Channel): Promise<void> {
  await channel.purgeQueue(QUEUE_NAME);
}

export async function consumeOneNotification(
  channel: Channel,
): Promise<ReleaseNotificationPayload | null> {
  const msg = await channel.get(QUEUE_NAME, { noAck: true });
  if (!msg) return null;
  return releaseNotificationPayloadSchema.parse(
    JSON.parse(msg.content.toString()),
  );
}
