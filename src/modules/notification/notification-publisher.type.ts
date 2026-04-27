import type { ReleaseNotificationPayload } from './notification.schemas';

export interface NotificationPublisher {
  publish(payload: ReleaseNotificationPayload): void;
}
