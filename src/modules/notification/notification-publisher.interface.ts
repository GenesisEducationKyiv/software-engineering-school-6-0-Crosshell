import type { ReleaseNotificationPayload } from './notification.schemas';

export interface INotificationPublisher {
  publish(payload: ReleaseNotificationPayload): void;
}
