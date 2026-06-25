import { db } from '@/infrastructure/database';
import { githubConfig, appConfig, scannerConfig } from '@/shared/config';
import { UnitOfWork } from '@/infrastructure/database/unit-of-work';
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
import { ScannerService, GithubReleaseFeedAdapter } from '@/modules/scanner';
import type { INotificationPublisher } from '@/modules/notification';
import type { ICacheService } from '@/infrastructure/cache/interfaces/cache.service.interface';
import type { ILogger } from '@/shared/logger/logger.interface';
import { ScannerMetrics } from '@/infrastructure/metrics/scanner-metrics';
import { GithubMetrics } from '@/infrastructure/metrics/github-metrics';
import { CronScheduler } from '@/infrastructure/scheduler/cron-scheduler';
import type { SagaCommandsQueue } from '@/infrastructure/queue/saga-commands.queue';
import {
  SubscribeSagaOrchestrator,
  SagaRepository,
  SubscribeSagaUoWContextBuilder,
} from '@/modules/saga';

export interface AppContainer {
  subscriptionService: SubscriptionService;
  scannerService: ScannerService;
  subscribeSagaOrchestrator: SubscribeSagaOrchestrator;
}

export function createContainer(
  notificationPublisher: INotificationPublisher,
  sagaCommandsQueue: SagaCommandsQueue,
  cache: ICacheService,
  logger: ILogger,
): AppContainer {
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

  const repositoryRepository = new RepositoryRepository(db);
  const subscriptionRepository = new SubscriptionRepository(db);
  const repositorySource = new GithubRepositorySourceAdapter(githubHttpClient);

  const subscriptionService = new SubscriptionService(subscriptionRepository);

  const subscribeSagaOrchestrator = new SubscribeSagaOrchestrator(
    new UnitOfWork(db, new SubscribeSagaUoWContextBuilder()),
    repositorySource,
    sagaCommandsQueue,
    new SagaRepository(db),
    logger,
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

  return { subscriptionService, scannerService, subscribeSagaOrchestrator };
}
