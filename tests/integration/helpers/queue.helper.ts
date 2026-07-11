import type { Channel } from 'amqplib';
import { beforeAll, afterAll, beforeEach } from 'vitest';
import {
  releaseNotificationPayloadSchema,
  NotificationQueue,
  QUEUE_NAME,
  RETRY_QUEUE_NAME,
  type ReleaseNotificationPayload,
} from '@/modules/notification';
import { QueueManager } from '@/infrastructure/queue/queue-manager';
import { logger } from '@/shared/logger';

export async function purgeNotificationQueue(channel: Channel): Promise<void> {
  await channel.purgeQueue(QUEUE_NAME);
  await channel.purgeQueue(RETRY_QUEUE_NAME);
}

export async function consumeOneNotification(
  channel: Channel,
): Promise<ReleaseNotificationPayload | null> {
  const msg = await channel.get(QUEUE_NAME, { noAck: true });

  if (!msg) {
    return null;
  }

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
    queueManager = new QueueManager({ url: process.env['RABBITMQ_URL']! });
    await queueManager.connect();
    notificationQueue = new NotificationQueue(queueManager, logger);
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
