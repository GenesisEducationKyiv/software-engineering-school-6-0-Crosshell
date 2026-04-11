import type { MailerService } from '@/modules/mailer/mailer.service';
import { logger } from '@/shared/logger';
import type { NotificationQueue } from '@/modules/notification/notification.queue';
import { buildUnsubscribeUrl } from '@/modules/subscription/subscription.urls';

export class NotificationService {
  constructor(
    private readonly mailer: MailerService,
    private readonly notificationQueue: NotificationQueue,
  ) {}

  start(): void {
    this.notificationQueue.consume(async (payload) => {
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
        if (result.status === 'rejected') {
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
