import type { ReleaseNotificationPayload } from '../notification.schemas';

export interface INotificationConsumer {
  consume(
    handler: (payload: ReleaseNotificationPayload) => Promise<void>,
  ): void;
}
