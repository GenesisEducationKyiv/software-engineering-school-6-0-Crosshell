import { db } from '@/infrastructure/database';
import { UnitOfWork } from '@/infrastructure/database/unit-of-work';
import { RepositoryRepository } from '@/modules/repository/repository.repository';
import { SubscriptionRepository } from '@/modules/subscription/subscription.repository';
import { SubscriptionService } from '@/modules/subscription/subscription.service';
import { GithubClient } from '@/modules/github/github.client';
import { MailerService } from '@/modules/mailer/mailer.service';
import { ScannerService } from '@/modules/scanner/scanner.service';
import { NotificationService } from '@/modules/notification/notification.service';
import type { INotificationPublisher } from '@/modules/notification/notification-publisher.interface';
import type { INotificationConsumer } from '@/modules/notification/notification.consumer.interface';
import type { ICacheService } from '@/infrastructure/cache/cache.service.interface';

export interface AppContainer {
  subscriptionService: SubscriptionService;
  scannerService: ScannerService;
  notificationService: NotificationService;
}

export function createContainer(
  notificationQueue: INotificationPublisher & INotificationConsumer,
  cache: ICacheService,
): AppContainer {
  const mailer = new MailerService();
  const github = new GithubClient(cache);
  const uow = new UnitOfWork(db);

  const repositoryRepository = new RepositoryRepository(db);
  const subscriptionRepository = new SubscriptionRepository(db);

  const subscriptionService = new SubscriptionService(
    uow,
    subscriptionRepository,
    github,
    mailer,
  );

  const scannerService = new ScannerService(
    repositoryRepository,
    github,
    notificationQueue,
  );

  const notificationService = new NotificationService(
    mailer,
    notificationQueue,
  );

  return { subscriptionService, scannerService, notificationService };
}
