import { describe, it, expect, beforeAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  repositoriesTable,
  subscriptionsTable,
} from '@/infrastructure/database/schema';
import { RepositoryRepository } from '@/modules/repository/repository.repository';
import { ScannerService } from '@/modules/scanner/scanner.service';
import { useDb, seedRepoWithConfirmedSubscriber } from './helpers/db.helper';
import { useRedis } from './helpers/redis.helper';
import { useQueue, consumeOneNotification } from './helpers/queue.helper';
import { createGithubClient } from './helpers/github.helper';
import { mswServer } from './setup';

const { getDb } = useDb();
const { getRedis } = useRedis();
const { getQueueManager, getNotificationQueue } = useQueue();

let scannerService: ScannerService;

beforeAll(() => {
  scannerService = new ScannerService(
    new RepositoryRepository(getDb()),
    createGithubClient(getRedis()),
    getNotificationQueue(),
    { start: () => {} },
  );
});

describe('ScannerService.scan()', () => {
  it('publishes a notification and updates lastSeenTag when a new release is detected', async () => {
    const { repoRow, subRow } = await seedRepoWithConfirmedSubscriber(
      getDb(),
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

    const message = await consumeOneNotification(
      getQueueManager().getChannel(),
    );

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

    const [updatedRepo] = await getDb()
      .select()
      .from(repositoriesTable)
      .where(eq(repositoriesTable.id, repoRow.id));

    expect(updatedRepo.lastSeenTag).toBe('v15.0.0');
  });

  it('does not publish and does not update the DB when the release tag is unchanged', async () => {
    const { repoRow } = await seedRepoWithConfirmedSubscriber(
      getDb(),
      'golang',
      'go',
      'v1.0.0',
    );

    await scannerService.scan();

    const message = await consumeOneNotification(
      getQueueManager().getChannel(),
    );
    expect(message).toBeNull();

    const [row] = await getDb()
      .select()
      .from(repositoriesTable)
      .where(eq(repositoriesTable.id, repoRow.id));

    expect(row.lastSeenTag).toBe('v1.0.0');
  });

  it('does not publish for repositories that have no confirmed subscriptions', async () => {
    const [repoRow] = await getDb()
      .insert(repositoriesTable)
      .values({ owner: 'golang', repo: 'go', lastSeenTag: null })
      .returning();

    await getDb().insert(subscriptionsTable).values({
      email: 'unconfirmed@example.com',
      repositoryId: repoRow.id,
      confirmed: false,
      confirmToken: randomUUID(),
      unsubscribeToken: randomUUID(),
    });

    await scannerService.scan();

    const message = await consumeOneNotification(
      getQueueManager().getChannel(),
    );
    expect(message).toBeNull();
  });

  it('publishes notifications with the correct payload for all confirmed subscribers', async () => {
    const [repoRow] = await getDb()
      .insert(repositoriesTable)
      .values({ owner: 'facebook', repo: 'react', lastSeenTag: 'v18.0.0' })
      .returning();

    const token1 = randomUUID();
    const token2 = randomUUID();

    await getDb()
      .insert(subscriptionsTable)
      .values([
        {
          email: 'alice@example.com',
          repositoryId: repoRow.id,
          confirmed: true,
          confirmToken: randomUUID(),
          unsubscribeToken: token1,
        },
        {
          email: 'bob@example.com',
          repositoryId: repoRow.id,
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

    const message = await consumeOneNotification(
      getQueueManager().getChannel(),
    );

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
      getDb(),
      'golang',
      'go',
      null,
    );

    await scannerService.scan();

    const message = await consumeOneNotification(
      getQueueManager().getChannel(),
    );
    expect(message).not.toBeNull();
    expect(message!.newTag).toBe('v1.0.0');

    const [updatedRepo] = await getDb()
      .select()
      .from(repositoriesTable)
      .where(eq(repositoriesTable.id, repoRow.id));

    expect(updatedRepo.lastSeenTag).toBe('v1.0.0');
  });

  it('continues scanning other repos when one GitHub API call returns 404', async () => {
    await seedRepoWithConfirmedSubscriber(getDb(), 'bad', 'nonexistent', null);

    const { repoRow: repoBRow } = await seedRepoWithConfirmedSubscriber(
      getDb(),
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

    const message = await consumeOneNotification(
      getQueueManager().getChannel(),
    );
    expect(message).not.toBeNull();
    expect(message!.repositoryRepo).toBe('go');

    const [updatedB] = await getDb()
      .select()
      .from(repositoriesTable)
      .where(eq(repositoriesTable.id, repoBRow.id));

    expect(updatedB.lastSeenTag).toBe('v1.0.0');
  });
});
