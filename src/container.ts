import { db } from '@/infrastructure/database';
import { githubConfig, appConfig, scannerConfig } from '@/shared/config';
import { UnitOfWork } from '@/infrastructure/database/unit-of-work';
import { SubscriptionUoWContextBuilder } from '@/modules/subscription';
import { RepositoryRepository } from '@/modules/repository';
import {
  SubscriptionService,
  SubscriptionRepository,
  GithubRepositorySourceAdapter,
} from '@/modules/subscription';
import {
  GithubHttpClient,
  CachingGithubHttpClientDecorator,
  MetricsGithubHttpClientDecorator,
} from '@/modules/github';
import { createMailerService } from '@/modules/mailer';
import { ScannerService, GithubReleaseFeedAdapter } from '@/modules/scanner';
import type { INotificationPublisher } from '@/modules/notification';
import type { ICacheService } from '@/infrastructure/cache/interfaces/cache.service.interface';
import type { ILogger } from '@/shared/logger/logger.interface';
import { ScannerMetrics } from '@/infrastructure/metrics/scanner-metrics';
import { GithubMetrics } from '@/infrastructure/metrics/github-metrics';
import { CronScheduler } from '@/infrastructure/scheduler/cron-scheduler';

export interface AppContainer {
  subscriptionService: SubscriptionService;
  scannerService: ScannerService;
}

export function createContainer(
  notificationPublisher: INotificationPublisher,
  cache: ICacheService,
  logger: ILogger,
): AppContainer {
  const mailer = createMailerService();

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

  const uow = new UnitOfWork(db, new SubscriptionUoWContextBuilder());

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
    notificationPublisher,
    new CronScheduler(scannerConfig.scannerCron),
    logger,
    new ScannerMetrics(),
  );

  return { subscriptionService, scannerService };
}
