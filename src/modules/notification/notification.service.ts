import type { IMailerService } from '@/modules/mailer/interfaces/mailer.service.interface';
import type { ILogger } from '@/shared/logger/logger.interface';
import type { INotificationConsumer } from '@/modules/notification/interfaces/notification.consumer.interface';
import { buildUnsubscribeUrl } from '@/modules/notification/notification.urls';
import type { INotificationMetrics } from '@/modules/notification/interfaces/notification-metrics.interface';

export class NotificationService {
  constructor(
    private readonly mailer: IMailerService,
    private readonly notificationConsumer: INotificationConsumer,
    private readonly logger: ILogger,
    private readonly metrics: INotificationMetrics,
  ) {}

  start(): void {
    this.notificationConsumer.consume(async (payload) => {
      const {
        repositoryOwner,
        repositoryRepo,
        newTag,
        releaseUrl,
        subscribers,
      } = payload;
      const repo = `${repositoryOwner}/${repositoryRepo}`;

      const results = await Promise.allSettled(
        subscribers.map(({ email, unsubscribeToken }) =>
          this.mailer.sendReleaseNotification(
            email,
            repo,
            newTag,
            releaseUrl,
            buildUnsubscribeUrl(unsubscribeToken),
          ),
        ),
      );

      results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          this.metrics.incSent('success');
        } else {
          this.metrics.incSent('failure');
          const err: unknown = result.reason;
          this.logger.error(
            { err, email: subscribers[i].email, repo },
            '[Notifier] Failed to send release email',
          );
        }
      });
    });

    this.logger.info('[Notifier] Listening for release notifications');
  }
}
