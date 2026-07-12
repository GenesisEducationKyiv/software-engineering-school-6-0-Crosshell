import { beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { UnitOfWork } from '@/infrastructure/database/unit-of-work';
import {
  SubscriptionRepository,
  GithubRepositorySourceAdapter,
  SubscriptionService,
  type ISubscriptionService,
  type SubscribeInput,
} from '@/modules/subscription';
import {
  GithubHttpClient,
  CachingGithubHttpClientDecorator,
} from '@/modules/github';
import { CacheService } from '@/infrastructure/cache/cache.service';
import { GithubMetrics } from '@/infrastructure/metrics/github-metrics';
import { logger } from '@/shared/logger';
import { ConflictError } from '@/shared/errors/app.errors';
import { isUniqueConstraintError } from '@/infrastructure/database/helpers/pg-errors.helper';
import {
  SubscribeSagaUoWContextBuilder,
  type SubscribeSagaOrchestrator,
} from '@/modules/saga';
import { buildSubscriptionApp } from './app.helper';
import { useDb, type UseDbReturn } from './db.helper';
import { useRedis } from './redis.helper';

function buildMockOrchestrator(
  getDb: UseDbReturn['getDb'],
  repositorySource: GithubRepositorySourceAdapter,
): SubscribeSagaOrchestrator {
  return {
    startReplyConsumer: () => {},
    execute: async (input: SubscribeInput) => {
      const { owner, repo } = await repositorySource.getRepository(
        input.repo,
      );
      const uow = new UnitOfWork(getDb(), new SubscribeSagaUoWContextBuilder());
      await uow.run(async ({ repositories, subscriptions }) => {
        const repository = await repositories.findOrCreate(owner, repo);
        try {
          await subscriptions.createSubscription({
            email: input.email,
            repositoryId: repository.id,
          });
        } catch (err) {
          if (isUniqueConstraintError(err)) {
            throw new ConflictError(
              'Email is already subscribed to this repository',
            );
          }
          throw err;
        }
      });
    },
  } as unknown as SubscribeSagaOrchestrator;
}

type SubscriptionTestReturn = {
  getApp: () => FastifyInstance;
  getService: () => ISubscriptionService;
  buildApp: (options?: { apiKey?: string }) => Promise<FastifyInstance>;
  findRepoByOwnerAndRepo: UseDbReturn['findRepoByOwnerAndRepo'];
  findAllRepos: UseDbReturn['findAllRepos'];
  findAllSubscriptions: UseDbReturn['findAllSubscriptions'];
  findSubscriptionById: UseDbReturn['findSubscriptionById'];
  findSubscriptionByEmailAndRepo: UseDbReturn['findSubscriptionByEmailAndRepo'];
};

export function useSubscriptionTest(): SubscriptionTestReturn {
  const {
    getDb,
    findRepoByOwnerAndRepo,
    findAllRepos,
    findAllSubscriptions,
    findSubscriptionById,
    findSubscriptionByEmailAndRepo,
  } = useDb();
  const { getRedis } = useRedis();

  let app: FastifyInstance;
  let subscriptionService: ISubscriptionService;
  let repositorySource: GithubRepositorySourceAdapter;

  beforeAll(async () => {
    const cache = new CacheService(getRedis(), logger);

    repositorySource = new GithubRepositorySourceAdapter(
      new CachingGithubHttpClientDecorator(
        new GithubHttpClient({ baseUrl: 'https://api.github.com' }),
        cache,
        new GithubMetrics(),
        { cacheTtlSeconds: 600 },
      ),
    );

    subscriptionService = new SubscriptionService(
      new SubscriptionRepository(getDb()),
    );

    app = await buildSubscriptionApp(
      subscriptionService,
      buildMockOrchestrator(getDb, repositorySource),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  return {
    getApp: () => app,
    getService: () => subscriptionService,
    buildApp: (options) =>
      buildSubscriptionApp(
        subscriptionService,
        buildMockOrchestrator(getDb, repositorySource),
        options,
      ),
    findRepoByOwnerAndRepo,
    findAllRepos,
    findAllSubscriptions,
    findSubscriptionById,
    findSubscriptionByEmailAndRepo,
  };
}
