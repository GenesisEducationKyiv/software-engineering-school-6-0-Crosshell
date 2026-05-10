import type { IMailerService } from '@/modules/mailer/mailer.service.interface';
import { logger } from '@/shared/logger';
import type { INotificationConsumer } from '@/modules/notification/notification.consumer.interface';
import { buildUnsubscribeUrl } from '@/modules/notification/notification.urls';
import { notificationsSentTotal } from '@/infrastructure/metrics/metrics.registry';

export class NotificationService {
  constructor(
    private readonly mailer: IMailerService,
    private readonly notificationConsumer: INotificationConsumer,
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
          notificationsSentTotal.inc({ status: 'success' });
        } else {
          notificationsSentTotal.inc({ status: 'failure' });
          logger.error(
            { err: result.reason, email: subscribers[i].email, repo },
            '[Notifier] Failed to send release email',
          );
        }
      });
    });

    logger.info('[Notifier] Listening for release notifications');
  }
}
