import { db } from '@/infrastructure/database';
import { UnitOfWork } from '@/infrastructure/database/unit-of-work';
import { RepositoryRepository } from '@/modules/repository/repository.repository';
import { SubscriptionRepository } from '@/modules/subscription/subscription.repository';
import { SubscriptionService } from '@/modules/subscription/subscription.service';
import { GithubClient } from '@/modules/github/github.client';
import { MailerService } from '@/modules/mailer/mailer.service';
import { ScannerService } from '@/modules/scanner/scanner.service';
import { NotificationService } from '@/modules/notification/notification.service';
import type { NotificationQueue } from '@/modules/notification/notification.queue';
import type { CacheService } from '@/infrastructure/cache/cache.service';

export function createContainer(
  notificationQueue: NotificationQueue,
  cache: CacheService,
) {
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

  return { subscriptionService, scannerService, notificationService } as const;
}

export type AppContainer = ReturnType<typeof createContainer>;
