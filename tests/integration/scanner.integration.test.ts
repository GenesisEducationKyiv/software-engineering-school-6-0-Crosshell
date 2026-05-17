import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import Redis from 'ioredis';
import { eq } from 'drizzle-orm';

import * as schema from '@/infrastructure/database/schema';
import {
  repositoriesTable,
  subscriptionsTable,
} from '@/infrastructure/database/schema';
import { UnitOfWork } from '@/infrastructure/database/unit-of-work';
import { UnitOfWorkContextBuilder } from '@/infrastructure/database/unit-of-work-context.builder';
import { RepositoryRepository } from '@/modules/repository/repository.repository';
import { GithubHttpClient } from '@/modules/github/github-http-client';
import { GithubAdapter } from '@/modules/github/github.adapter';
import { CacheService } from '@/infrastructure/cache/cache.service';
import { ScannerService } from '@/modules/scanner/scanner.service';
import { NotificationQueue } from '@/modules/notification/notification.queue';
import { QueueManager } from '@/infrastructure/queue/queue-manager';

import { truncateAllTables } from './helpers/db.helper';
import {
  purgeNotificationQueue,
  consumeOneNotification,
} from './helpers/queue.helper';
import { mswServer } from './setup';

let pool: Pool;
let redisClient: Redis;
let queueManager: QueueManager;
let notificationQueue: NotificationQueue;
let scannerService: ScannerService;

beforeAll(async () => {
  pool = new Pool({ connectionString: process.env['DATABASE_URL']! });
  const db = drizzle(pool, { schema });

  redisClient = new Redis(process.env['REDIS_URL']!);

  queueManager = new QueueManager();
  await queueManager.connect();

  notificationQueue = new NotificationQueue(queueManager);

  await notificationQueue.setup();

  const cache = new CacheService(redisClient);
  const repositoryRepository = new RepositoryRepository(db);
  const github = new GithubAdapter(new GithubHttpClient(cache));

  scannerService = new ScannerService(
    repositoryRepository,
    github,
    notificationQueue,
    { start: () => {} },
  );
});

afterAll(async () => {
  await queueManager.close();
  await redisClient.quit();
  await pool.end();
});

beforeEach(async () => {
  const db = drizzle(pool, { schema });
  await truncateAllTables(db);
  await redisClient.flushall();
  await purgeNotificationQueue(queueManager.getChannel());
});

function db() {
  return drizzle(pool, { schema });
}

async function seedRepoWithConfirmedSubscriber(
  owner: string,
  repo: string,
  lastSeenTag: string | null,
  subscriberEmail = 'subscriber@example.com',
) {
  const [repoRow] = await db()
    .insert(repositoriesTable)
    .values({ owner, repo, lastSeenTag })
    .returning();

  const [subRow] = await db()
    .insert(subscriptionsTable)
    .values({
      email: subscriberEmail,
      repositoryId: repoRow!.id,
      confirmed: true,
      confirmToken: randomUUID(),
      unsubscribeToken: randomUUID(),
    })
    .returning();

  return { repoRow: repoRow!, subRow: subRow! };
}

describe('ScannerService.scan()', () => {
  it('Scenario B: publishes a notification and updates lastSeenTag when a new release is detected', async () => {
    const { repoRow, subRow } = await seedRepoWithConfirmedSubscriber(
      'vercel',
      'next.js',
      'v14.0.0',
    );

    mswServer.use(
      http.get(
        'https://api.github.com/repos/vercel/next.js/releases/latest',
        () =>
          HttpResponse.json({
            tag_name: 'v15.0.0',
            html_url: 'https://github.com/vercel/next.js/releases/tag/v15.0.0',
          }),
      ),
    );

    await scannerService.scan();

    const message = await consumeOneNotification(queueManager.getChannel());

    expect(message).not.toBeNull();
    expect(message).toMatchObject({
      repositoryOwner: 'vercel',
      repositoryRepo: 'next.js',
      newTag: 'v15.0.0',
      releaseUrl: 'https://github.com/vercel/next.js/releases/tag/v15.0.0',
      subscribers: [
        {
          email: 'subscriber@example.com',
          unsubscribeToken: subRow.unsubscribeToken,
        },
      ],
    });

    const [updatedRepo] = await db()
      .select()
      .from(repositoriesTable)
      .where(eq(repositoriesTable.id, repoRow.id));

    expect(updatedRepo!.lastSeenTag).toBe('v15.0.0');
  });

  it('does not publish and does not update the DB when the release tag is unchanged', async () => {
    const { repoRow } = await seedRepoWithConfirmedSubscriber(
      'golang',
      'go',
      'v1.0.0',
    );

    await scannerService.scan();

    const message = await consumeOneNotification(queueManager.getChannel());
    expect(message).toBeNull();

    const [row] = await db()
      .select()
      .from(repositoriesTable)
      .where(eq(repositoriesTable.id, repoRow.id));

    expect(row!.lastSeenTag).toBe('v1.0.0');
  });

  it('does not publish for repositories that have no confirmed subscriptions', async () => {
    const [repoRow] = await db()
      .insert(repositoriesTable)
      .values({ owner: 'golang', repo: 'go', lastSeenTag: null })
      .returning();

    await db().insert(subscriptionsTable).values({
      email: 'unconfirmed@example.com',
      repositoryId: repoRow!.id,
      confirmed: false,
      confirmToken: randomUUID(),
      unsubscribeToken: randomUUID(),
    });

    await scannerService.scan();

    const message = await consumeOneNotification(queueManager.getChannel());
    expect(message).toBeNull();
  });

  it('publishes notifications with the correct payload for all confirmed subscribers', async () => {
    const [repoRow] = await db()
      .insert(repositoriesTable)
      .values({ owner: 'facebook', repo: 'react', lastSeenTag: 'v18.0.0' })
      .returning();

    const token1 = randomUUID();
    const token2 = randomUUID();

    await db()
      .insert(subscriptionsTable)
      .values([
        {
          email: 'alice@example.com',
          repositoryId: repoRow!.id,
          confirmed: true,
          confirmToken: randomUUID(),
          unsubscribeToken: token1,
        },
        {
          email: 'bob@example.com',
          repositoryId: repoRow!.id,
          confirmed: true,
          confirmToken: randomUUID(),
          unsubscribeToken: token2,
        },
      ]);

    mswServer.use(
      http.get(
        'https://api.github.com/repos/facebook/react/releases/latest',
        () =>
          HttpResponse.json({
            tag_name: 'v19.0.0',
            html_url: 'https://github.com/facebook/react/releases/tag/v19.0.0',
          }),
      ),
    );

    await scannerService.scan();

    const message = await consumeOneNotification(queueManager.getChannel());

    expect(message).not.toBeNull();
    expect(message!.subscribers).toHaveLength(2);
    expect(message!.subscribers).toEqual(
      expect.arrayContaining([
        { email: 'alice@example.com', unsubscribeToken: token1 },
        { email: 'bob@example.com', unsubscribeToken: token2 },
      ]),
    );
    expect(message!.newTag).toBe('v19.0.0');
  });

  it('processes a first-ever release (lastSeenTag was null)', async () => {
    const { repoRow } = await seedRepoWithConfirmedSubscriber(
      'golang',
      'go',
      null,
    );

    await scannerService.scan();

    const message = await consumeOneNotification(queueManager.getChannel());
    expect(message).not.toBeNull();
    expect(message!.newTag).toBe('v1.0.0');

    const [updatedRepo] = await db()
      .select()
      .from(repositoriesTable)
      .where(eq(repositoriesTable.id, repoRow.id));

    expect(updatedRepo!.lastSeenTag).toBe('v1.0.0');
  });

  it('continues scanning other repos when one GitHub API call returns 404', async () => {
    await seedRepoWithConfirmedSubscriber('bad', 'nonexistent', null);

    const { repoRow: repoBRow } = await seedRepoWithConfirmedSubscriber(
      'golang',
      'go',
      null,
    );

    mswServer.use(
      http.get(
        'https://api.github.com/repos/bad/nonexistent/releases/latest',
        () => HttpResponse.json({ message: 'Not Found' }, { status: 404 }),
      ),
    );

    await scannerService.scan();

    const message = await consumeOneNotification(queueManager.getChannel());
    expect(message).not.toBeNull();
    expect(message!.repositoryRepo).toBe('go');

    const [updatedB] = await db()
      .select()
      .from(repositoriesTable)
      .where(eq(repositoriesTable.id, repoBRow.id));

    expect(updatedB!.lastSeenTag).toBe('v1.0.0');
  });
});

describe('RepositoryRepository', () => {
  it('findOrCreate returns the same row on subsequent calls', async () => {
    const uow = new UnitOfWork(
      drizzle(pool, { schema }),
      new UnitOfWorkContextBuilder(),
    );

    const first = await uow.run(({ repositories }) =>
      repositories.findOrCreate('golang', 'go'),
    );
    const second = await uow.run(({ repositories }) =>
      repositories.findOrCreate('golang', 'go'),
    );

    expect(first.id).toBe(second.id);

    const rows = await db().select().from(repositoriesTable);
    expect(rows).toHaveLength(1);
  });
});
