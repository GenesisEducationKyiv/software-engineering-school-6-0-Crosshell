import nodemailer from 'nodemailer';
import { db } from '@/infrastructure/database';
import { mailerConfig, githubConfig, appConfig } from '@/shared/config';
import { UnitOfWork } from '@/infrastructure/database/unit-of-work';
import { UnitOfWorkContextBuilder } from '@/infrastructure/database/unit-of-work-context.builder';
import { RepositoryRepository } from '@/modules/repository/repository.repository';
import { SubscriptionRepository } from '@/modules/subscription/subscription.repository';
import { SubscriptionService } from '@/modules/subscription/subscription.service';
import { GithubHttpClient } from '@/modules/github/github-http-client';
import { CachingGithubHttpClientDecorator } from '@/modules/github/decorators/caching-github-http-client.decorator';
import { MetricsGithubHttpClientDecorator } from '@/modules/github/decorators/metrics-github-http-client.decorator';
import { GithubRepositorySourceAdapter } from '@/modules/subscription/infrastructure/github-repository-source.adapter';
import { GithubReleaseFeedAdapter } from '@/modules/scanner/infrastructure/github-release-feed.adapter';
import { MailerService } from '@/modules/mailer/mailer.service';
import { NodemailerEmailTransport } from '@/modules/mailer/nodemailer-email-transport';
import { ScannerService } from '@/modules/scanner/scanner.service';
import { CronScheduler } from '@/infrastructure/scheduler/cron-scheduler';
import { scannerConfig } from '@/shared/config';
import { NotificationService } from '@/modules/notification/notification.service';
import type { INotificationPublisher } from '@/modules/notification/interfaces/notification-publisher.interface';
import type { INotificationConsumer } from '@/modules/notification/interfaces/notification.consumer.interface';
import type { ICacheService } from '@/infrastructure/cache/interfaces/cache.service.interface';
import type { ILogger } from '@/shared/logger/logger.interface';
import { ScannerMetrics } from '@/infrastructure/metrics/scanner-metrics';
import { NotificationMetrics } from '@/infrastructure/metrics/notification-metrics';
import { GithubMetrics } from '@/infrastructure/metrics/github-metrics';

export interface AppContainer {
  subscriptionService: SubscriptionService;
  scannerService: ScannerService;
  notificationService: NotificationService;
}

export function createContainer(
  notificationQueue: INotificationPublisher & INotificationConsumer,
  cache: ICacheService,
  logger: ILogger,
): AppContainer {
  const transporter = nodemailer.createTransport({
    host: mailerConfig.host,
    port: mailerConfig.port,
    auth: {
      user: mailerConfig.user,
      pass: mailerConfig.pass,
    },
  });
  const mailer = new MailerService(new NodemailerEmailTransport(transporter), {
    from: mailerConfig.from,
  });

  const githubMetrics = new GithubMetrics();
  const githubHttpClient = new CachingGithubHttpClientDecorator(
    new MetricsGithubHttpClientDecorator(
      new GithubHttpClient({
        baseUrl: githubConfig.baseUrl,
        token: githubConfig.token,
      }),
      githubMetrics,
    ),
    cache,
    githubMetrics,
    { cacheTtlSeconds: githubConfig.cacheTtlSeconds },
  );

  const uow = new UnitOfWork(db, new UnitOfWorkContextBuilder());

  const repositoryRepository = new RepositoryRepository(db);
  const subscriptionRepository = new SubscriptionRepository(db);

  const subscriptionService = new SubscriptionService(
    uow,
    subscriptionRepository,
    new GithubRepositorySourceAdapter(githubHttpClient),
    mailer,
    { appUrl: appConfig.appUrl },
  );

  const scannerService = new ScannerService(
    repositoryRepository,
    new GithubReleaseFeedAdapter(githubHttpClient),
    notificationQueue,
    new CronScheduler(scannerConfig.scannerCron),
    logger,
    new ScannerMetrics(),
  );

  const notificationService = new NotificationService(
    mailer,
    notificationQueue,
    logger,
    new NotificationMetrics(),
    { appUrl: appConfig.appUrl },
  );

  return { subscriptionService, scannerService, notificationService };
}
