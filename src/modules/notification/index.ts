export { NotificationQueue } from './notification.queue';
export { NotificationService } from './notification.service';
export { createNotificationQueue } from './notification-queue.factory';
export type { CreatedNotificationQueue } from './notification-queue.factory';
export type { INotificationPublisher } from './interfaces/notification-publisher.interface';
export type { INotificationConsumer } from './interfaces/notification.consumer.interface';
export type { INotificationMetrics } from './interfaces/notification-metrics.interface';
export { releaseNotificationPayloadSchema } from './notification.schemas';
export type { ReleaseNotificationPayload } from './notification.schemas';
export {
  QUEUE_NAME,
  DLQ_NAME,
  RETRY_QUEUE_NAME,
} from './notification.constants';
