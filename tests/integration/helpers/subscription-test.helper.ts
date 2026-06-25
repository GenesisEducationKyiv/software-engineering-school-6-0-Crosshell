import { vi, type MockInstance, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { UnitOfWork } from '@/infrastructure/database/unit-of-work';
import { UnitOfWorkContextBuilder } from '@/infrastructure/database/unit-of-work-context.builder';
import { SubscriptionRepository } from '@/modules/subscription/subscription.repository';
import { GithubHttpClient } from '@/modules/github/github-http-client';
import { CachingGithubHttpClientDecorator } from '@/modules/github/decorators/caching-github-http-client.decorator';
import { GithubRepositorySourceAdapter } from '@/modules/subscription/infrastructure/github-repository-source.adapter';
import { SubscriptionService } from '@/modules/subscription/subscription.service';
import type { ISubscriptionService } from '@/modules/subscription/interfaces/subscription.service.interface';
import { CacheService } from '@/infrastructure/cache/cache.service';
import { GithubMetrics } from '@/infrastructure/metrics/github-metrics';
import { logger } from '@/shared/logger';
import type { Database } from '@/infrastructure/database';
import { buildSubscriptionApp } from './app.helper';
import { useDb } from './db.helper';
import { useRedis } from './redis.helper';
import { createTestMailer } from './mailer.helper';

export function useSubscriptionTest(): {
  getApp: () => FastifyInstance;
  getService: () => ISubscriptionService;
  getSendConfirmationSpy: () => MockInstance;
  getDb: () => Database;
} {
  const { getDb } = useDb();
  const { getRedis } = useRedis();

  let app: FastifyInstance;
  let subscriptionService: ISubscriptionService;
  let sendConfirmationSpy: MockInstance;

  beforeAll(async () => {
    const db = getDb();
    const cache = new CacheService(getRedis(), logger);
    const mailer = createTestMailer();

    sendConfirmationSpy = vi
      .spyOn(mailer, 'sendConfirmationEmail')
      .mockImplementation(async () => {});

    subscriptionService = new SubscriptionService(
      new UnitOfWork(db, new UnitOfWorkContextBuilder()),
      new SubscriptionRepository(db),
      new GithubRepositorySourceAdapter(
        new CachingGithubHttpClientDecorator(
          new GithubHttpClient({ baseUrl: 'https://api.github.com' }),
          cache,
          new GithubMetrics(),
          { cacheTtlSeconds: 600 },
        ),
      ),
      mailer,
      { appUrl: 'http://localhost:3000' },
    );

    app = await buildSubscriptionApp(subscriptionService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    sendConfirmationSpy.mockClear();
  });

  return {
    getApp: () => app,
    getService: () => subscriptionService,
    getSendConfirmationSpy: () => sendConfirmationSpy,
    getDb,
  };
}
