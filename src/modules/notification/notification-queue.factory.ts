import {
  QueueManager,
  type QueueManagerConfig,
} from '@/infrastructure/queue/queue-manager';
import type { ILogger } from '@/shared/logger/logger.interface';
import { NotificationQueue } from './notification.queue';

export interface CreatedNotificationQueue {
  queueManager: QueueManager;
  notificationQueue: NotificationQueue;
}

export const createNotificationQueue = async (
  config: QueueManagerConfig,
  logger: ILogger,
): Promise<CreatedNotificationQueue> => {
  const queueManager = new QueueManager(config);
  await queueManager.connect();

  const notificationQueue = new NotificationQueue(queueManager, logger);
  await notificationQueue.setup();

  return { queueManager, notificationQueue };
};
