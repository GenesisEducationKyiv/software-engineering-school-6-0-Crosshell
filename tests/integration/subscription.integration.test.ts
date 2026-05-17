import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
  type MockInstance,
} from 'vitest';
import { http, HttpResponse } from 'msw';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import Redis from 'ioredis';
import { and, eq } from 'drizzle-orm';

import * as schema from '@/infrastructure/database/schema';
import {
  repositoriesTable,
  subscriptionsTable,
} from '@/infrastructure/database/schema';
import { UnitOfWork } from '@/infrastructure/database/unit-of-work';
import { UnitOfWorkContextBuilder } from '@/infrastructure/database/unit-of-work-context.builder';
import { SubscriptionRepository } from '@/modules/subscription/subscription.repository';
import { GithubClient } from '@/modules/github/github.client';
import nodemailer from 'nodemailer';
import { MailerService } from '@/modules/mailer/mailer.service';
import { NodemailerEmailTransport } from '@/modules/mailer/nodemailer-email-transport';
import { SubscriptionService } from '@/modules/subscription/subscription.service';
import { CacheService } from '@/infrastructure/cache/cache.service';

import { buildTestApp, type TestApp } from './helpers/app.helper';
import { truncateAllTables } from './helpers/db.helper';
import { mswServer } from './setup';

let app: TestApp;
let pool: Pool;
let redisClient: Redis;
let mailer: MailerService;
let sendConfirmationSpy: MockInstance;

beforeAll(async () => {
  pool = new Pool({ connectionString: process.env['DATABASE_URL']! });
  const db = drizzle(pool, { schema });

  redisClient = new Redis(process.env['REDIS_URL']!);

  const cache = new CacheService(redisClient);
  const uow = new UnitOfWork(db, new UnitOfWorkContextBuilder());
  const subscriptionRepository = new SubscriptionRepository(db);
  const github = new GithubClient(cache);
  mailer = new MailerService(
    new NodemailerEmailTransport(nodemailer.createTransport({ jsonTransport: true })),
  );

  sendConfirmationSpy = vi
    .spyOn(mailer, 'sendConfirmationEmail')
    .mockImplementation(async () => {});

  const subscriptionService = new SubscriptionService(
    uow,
    subscriptionRepository,
    github,
    mailer,
  );

  app = await buildTestApp(subscriptionService);
});

afterAll(async () => {
  await app.close();
  await redisClient.quit();
  await pool.end();
});

beforeEach(async () => {
  const db = drizzle(pool, { schema });
  await truncateAllTables(db);
  await redisClient.flushall();
  sendConfirmationSpy.mockClear();
});

function getDb() {
  return drizzle(pool, { schema });
}

describe('POST /api/subscribe', () => {
  it('returns 200 and persists repository + unconfirmed subscription, then sends confirmation email', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/subscribe',
      payload: { email: 'alice@example.com', repo: 'golang/go' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ message: string }>()).toMatchObject({
      message: expect.stringContaining('Confirmation email sent'),
    });

    const [repoRow] = await getDb()
      .select()
      .from(repositoriesTable)
      .where(
        and(
          eq(repositoriesTable.owner, 'golang'),
          eq(repositoriesTable.repo, 'go'),
        ),
      );

    expect(repoRow).toBeDefined();
    expect(repoRow.owner).toBe('golang');
    expect(repoRow.repo).toBe('go');
    expect(repoRow.lastSeenTag).toBeNull();

    const [subRow] = await getDb()
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.repositoryId, repoRow.id));

    expect(subRow).toBeDefined();
    expect(subRow.email).toBe('alice@example.com');
    expect(subRow.confirmed).toBe(false);
    expect(subRow.confirmToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(subRow.unsubscribeToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    expect(sendConfirmationSpy).toHaveBeenCalledOnce();
    expect(sendConfirmationSpy).toHaveBeenCalledWith(
      'alice@example.com',
      expect.stringContaining(subRow.confirmToken),
    );
  });

  it('returns 409 when the same email subscribes to the same repository twice', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/subscribe',
      payload: { email: 'alice@example.com', repo: 'golang/go' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/subscribe',
      payload: { email: 'alice@example.com', repo: 'golang/go' },
    });

    expect(response.statusCode).toBe(409);
  });

  it('returns 404 when the GitHub repository does not exist', async () => {
    mswServer.use(
      http.get('https://api.github.com/repos/nonexistent/repo', () =>
        HttpResponse.json({ message: 'Not Found' }, { status: 404 }),
      ),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/subscribe',
      payload: { email: 'alice@example.com', repo: 'nonexistent/repo' },
    });

    expect(response.statusCode).toBe(404);

    const repos = await getDb().select().from(repositoriesTable);
    expect(repos).toHaveLength(0);
  });

  it('returns 400 when the request body is invalid', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/subscribe',
      payload: { email: 'not-an-email', repo: 'golang/go' },
    });

    expect(response.statusCode).toBe(400);
    expect(sendConfirmationSpy).not.toHaveBeenCalled();
  });
});

describe('GET /api/confirm/:token', () => {
  it('confirms the subscription and marks it as confirmed in the database', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/subscribe',
      payload: { email: 'alice@example.com', repo: 'golang/go' },
    });

    const [subRow] = await getDb().select().from(subscriptionsTable);
    expect(subRow.confirmed).toBe(false);

    const response = await app.inject({
      method: 'GET',
      url: `/api/confirm/${subRow.confirmToken}`,
    });

    expect(response.statusCode).toBe(200);

    const [confirmedRow] = await getDb()
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.id, subRow.id));

    expect(confirmedRow.confirmed).toBe(true);
  });

  it('returns 404 for an unknown confirmation token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/confirm/00000000-0000-0000-0000-000000000000',
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('GET /api/unsubscribe/:token', () => {
  it('deletes the subscription from the database', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/subscribe',
      payload: { email: 'alice@example.com', repo: 'golang/go' },
    });

    const [subRow] = await getDb().select().from(subscriptionsTable);

    const response = await app.inject({
      method: 'GET',
      url: `/api/unsubscribe/${subRow.unsubscribeToken}`,
    });

    expect(response.statusCode).toBe(200);

    const remaining = await getDb().select().from(subscriptionsTable);
    expect(remaining).toHaveLength(0);
  });
});

describe('GET /api/subscriptions', () => {
  it('returns only confirmed subscriptions for the given email', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/subscribe',
      payload: { email: 'alice@example.com', repo: 'golang/go' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/subscribe',
      payload: { email: 'alice@example.com', repo: 'facebook/react' },
    });

    const [firstSub] = await getDb()
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.email, 'alice@example.com'));

    await app.inject({
      method: 'GET',
      url: `/api/confirm/${firstSub.confirmToken}`,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/subscriptions?email=alice@example.com',
    });

    expect(response.statusCode).toBe(200);
    const body =
      response.json<{ email: string; repo: string; confirmed: boolean }[]>();
    expect(body).toHaveLength(1);
    expect(body[0]?.confirmed).toBe(true);
    expect(body[0]?.email).toBe('alice@example.com');
  });
});
