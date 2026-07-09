import { beforeAll } from 'vitest';
import { RepositoryRepository } from '@/modules/repository';
import {
  GithubHttpClient,
  CachingGithubHttpClientDecorator,
} from '@/modules/github';
import { ScannerService, GithubReleaseFeedAdapter } from '@/modules/scanner';
import { CacheService } from '@/infrastructure/cache/cache.service';
import { ScannerMetrics } from '@/infrastructure/metrics/scanner-metrics';
import { GithubMetrics } from '@/infrastructure/metrics/github-metrics';
import { logger } from '@/shared/logger';
import { useDb } from './db.helper';
import { useRedis } from './redis.helper';
import { useQueue } from './queue.helper';
import type { QueueManager } from '@/infrastructure/queue/queue-manager';
import type {
  repositoriesTable,
  subscriptionsTable,
} from '@/infrastructure/database/schema';

type RepoRow = typeof repositoriesTable.$inferSelect;
type SubRow = typeof subscriptionsTable.$inferSelect;

export function useScannerTest(): {
  getService: () => ScannerService;
  getQueueManager: () => QueueManager;
  seedRepoWithConfirmedSubscriber: (
    owner: string,
    repo: string,
    lastSeenTag: string | null,
    subscriberEmail?: string,
  ) => Promise<{ repoRow: RepoRow; subRow: SubRow }>;
  insertRepo: (
    owner: string,
    repo: string,
    lastSeenTag: string | null,
  ) => Promise<RepoRow>;
  insertSubscription: (
    email: string,
    repositoryId: string,
    confirmed: boolean,
  ) => Promise<SubRow>;
  getRepoById: (id: string) => Promise<RepoRow | null>;
} {
  const {
    seedRepoWithConfirmedSubscriber,
    insertRepo,
    insertSubscription,
    getRepoById,
    getDb,
  } = useDb();
  const { getRedis } = useRedis();
  const { getQueueManager, getNotificationQueue } = useQueue();

  let scannerService: ScannerService;

  beforeAll(() => {
    scannerService = new ScannerService(
      new RepositoryRepository(getDb()),
      new GithubReleaseFeedAdapter(
        new CachingGithubHttpClientDecorator(
          new GithubHttpClient({ baseUrl: 'https://api.github.com' }),
          new CacheService(getRedis(), logger),
          new GithubMetrics(),
          { cacheTtlSeconds: 600 },
        ),
      ),
      getNotificationQueue(),
      { start: () => {} },
      logger,
      new ScannerMetrics(),
    );
  });

  return {
    getService: () => scannerService,
    getQueueManager,
    seedRepoWithConfirmedSubscriber,
    insertRepo,
    insertSubscription,
    getRepoById,
  };
}
