import nodemailer from 'nodemailer';
import { db } from '@/infrastructure/database';
import { mailerConfig } from '@/shared/config';
import { UnitOfWork } from '@/infrastructure/database/unit-of-work';
import { UnitOfWorkContextBuilder } from '@/infrastructure/database/unit-of-work-context.builder';
import { RepositoryRepository } from '@/modules/repository/repository.repository';
import { SubscriptionRepository } from '@/modules/subscription/subscription.repository';
import { SubscriptionService } from '@/modules/subscription/subscription.service';
import { GithubClient } from '@/modules/github/github.client';
import { MailerService } from '@/modules/mailer/mailer.service';
import { NodemailerEmailTransport } from '@/modules/mailer/nodemailer-email-transport';
import { ScannerService } from '@/modules/scanner/scanner.service';
import { CronScheduler } from '@/infrastructure/scheduler/cron-scheduler';
import { scannerConfig } from '@/shared/config';
import { NotificationService } from '@/modules/notification/notification.service';
import type { INotificationPublisher } from '@/modules/notification/interfaces/notification-publisher.interface';
import type { INotificationConsumer } from '@/modules/notification/interfaces/notification.consumer.interface';
import type { ICacheService } from '@/infrastructure/cache/interfaces/cache.service.interface';

export interface AppContainer {
  subscriptionService: SubscriptionService;
  scannerService: ScannerService;
  notificationService: NotificationService;
}

export function createContainer(
  notificationQueue: INotificationPublisher & INotificationConsumer,
  cache: ICacheService,
): AppContainer {
  const transporter = nodemailer.createTransport({
    host: mailerConfig.host,
    port: mailerConfig.port,
    auth: {
      user: mailerConfig.user,
      pass: mailerConfig.pass,
    },
  });
  const mailer = new MailerService(new NodemailerEmailTransport(transporter));

  const github = new GithubClient(cache);
  const uow = new UnitOfWork(db, new UnitOfWorkContextBuilder());

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
    new CronScheduler(scannerConfig.scannerCron),
  );

  const notificationService = new NotificationService(
    mailer,
    notificationQueue,
  );

  return { subscriptionService, scannerService, notificationService };
}
