import type { Channel } from 'amqplib';
import { beforeAll, afterAll, beforeEach } from 'vitest';
import {
  releaseNotificationPayloadSchema,
  type ReleaseNotificationPayload,
} from '@/modules/notification/notification.schemas';
import { NotificationQueue } from '@/modules/notification/notification.queue';
import { QueueManager } from '@/infrastructure/queue/queue-manager';

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

export function useQueue(): {
  getQueueManager: () => QueueManager;
  getNotificationQueue: () => NotificationQueue;
} {
  let queueManager: QueueManager;
  let notificationQueue: NotificationQueue;

  beforeAll(async () => {
    queueManager = new QueueManager();
    await queueManager.connect();
    notificationQueue = new NotificationQueue(queueManager);
    await notificationQueue.setup();
  });

  afterAll(async () => {
    await queueManager.close();
  });

  beforeEach(async () => {
    await purgeNotificationQueue(queueManager.getChannel());
  });

  return {
    getQueueManager: () => queueManager,
    getNotificationQueue: () => notificationQueue,
  };
}
