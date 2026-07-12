import type { IMailerService } from '@/modules/mailer';
import type { ILogger } from '@/shared/logger/logger.interface';
import type { INotificationConsumer } from './interfaces/notification.consumer.interface';
import { buildUnsubscribeUrl } from '@/shared/utils/url-builders';
import type { INotificationMetrics } from './interfaces/notification-metrics.interface';

export interface NotificationServiceConfig {
  appUrl: string;
}

export class NotificationService {
  constructor(
    private readonly mailer: IMailerService,
    private readonly notificationConsumer: INotificationConsumer,
    private readonly logger: ILogger,
    private readonly metrics: INotificationMetrics,
    private readonly config: NotificationServiceConfig,
  ) {}

  start(): void {
    this.notificationConsumer.consume(async (payload) => {
      const {
        repositoryOwner,
        repositoryRepo,
        newTag,
        releaseUrl,
        subscriber,
      } = payload;
      const repo = `${repositoryOwner}/${repositoryRepo}`;

      const start = performance.now();
      try {
        await this.mailer.sendReleaseNotification(
          subscriber.email,
          repo,
          newTag,
          releaseUrl,
          buildUnsubscribeUrl(subscriber.unsubscribeToken, this.config.appUrl),
        );
        this.metrics.incSent('success');
      } catch (err) {
        this.metrics.incSent('failure');
        this.logger.error(
          { err, email: subscriber.email, repo },
          '[Notifier] Failed to send release email',
        );
        throw err;
      } finally {
        this.metrics.observeProcessingDuration(
          (performance.now() - start) / 1000,
        );
      }
    });

    this.logger.info('[Notifier] Listening for release notifications');
  }
}
