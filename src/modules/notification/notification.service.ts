import { MailerService } from '@/modules/mailer/mailer.service';
import { appConfig } from '@/shared/config/app.config';
import { logger } from '@/shared/logger';
import { consumeReleaseNotifications } from '@/modules/notification/notification.queue';

export class NotificationService {
  constructor(private readonly mailer: MailerService) {}

  start(): void {
    consumeReleaseNotifications(async (payload) => {
      const {
        repositoryOwner,
        repositoryRepo,
        newTag,
        releaseUrl,
        subscribers,
      } = payload;
      const repo = `${repositoryOwner}/${repositoryRepo}`;

      await Promise.allSettled(
        subscribers.map(({ email, unsubscribeToken }) => {
          const unsubscribeUrl = `${appConfig.appUrl}/api/unsubscribe/${unsubscribeToken}`;
          return this.mailer.sendReleaseNotification(
            email,
            repo,
            newTag,
            releaseUrl,
            unsubscribeUrl,
          );
        }),
      );
    });

    logger.info('[Notifier] Listening for release notifications');
  }
}
