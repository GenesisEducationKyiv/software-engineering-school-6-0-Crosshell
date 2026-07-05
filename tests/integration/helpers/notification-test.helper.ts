import { vi, beforeAll, beforeEach, type MockInstance } from 'vitest';
import { NotificationService } from '@/modules/notification/notification.service';
import { NotificationMetrics } from '@/infrastructure/metrics/notification-metrics';
import { logger } from '@/shared/logger';
import { useQueue } from './queue.helper';
import { createTestMailer } from './mailer.helper';
import type { QueueManager } from '@/infrastructure/queue/queue-manager';
import type { NotificationQueue } from '@/modules/notification/notification.queue';

export function useNotificationTest(): {
  getSendReleaseNotificationSpy: () => MockInstance;
  getQueueManager: () => QueueManager;
  getNotificationQueue: () => NotificationQueue;
} {
  const { getQueueManager, getNotificationQueue } = useQueue();

  let sendReleaseNotificationSpy: MockInstance;

  beforeAll(() => {
    const mailer = createTestMailer();
    sendReleaseNotificationSpy = vi
      .spyOn(mailer, 'sendReleaseNotification')
      .mockResolvedValue(undefined);

    new NotificationService(
      mailer,
      getNotificationQueue(),
      logger,
      new NotificationMetrics(),
      { appUrl: 'http://localhost:3000' },
    ).start();
  });

  beforeEach(() => {
    sendReleaseNotificationSpy.mockClear();
    sendReleaseNotificationSpy.mockResolvedValue(undefined);
  });

  return {
    getSendReleaseNotificationSpy: () => sendReleaseNotificationSpy,
    getQueueManager,
    getNotificationQueue,
  };
}
