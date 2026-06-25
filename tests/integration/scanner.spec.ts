import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { useScannerTest } from './helpers/scanner-test.helper';
import { consumeOneNotification } from './helpers/queue.helper';
import { mswServer } from './setup';

const {
  getService,
  getQueueManager,
  seedRepoWithConfirmedSubscriber,
  insertRepo,
  insertSubscription,
  getRepoById,
} = useScannerTest();

describe('ScannerService.scan()', () => {
  it('publishes a notification and updates lastSeenTag when a new release is detected', async () => {
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

    await getService().scan();

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

    const updatedRepo = await getRepoById(repoRow.id);
    expect(updatedRepo?.lastSeenTag).toBe('v15.0.0');
  });

  it('does not publish and does not update the DB when the release tag is unchanged', async () => {
    const { repoRow } = await seedRepoWithConfirmedSubscriber(
      'golang',
      'go',
      'v1.0.0',
    );

    await getService().scan();

    const message = await consumeOneNotification(
      getQueueManager().getChannel(),
    );
    expect(message).toBeNull();

    const row = await getRepoById(repoRow.id);
    expect(row?.lastSeenTag).toBe('v1.0.0');
  });

  it('does not publish for repositories that have no confirmed subscriptions', async () => {
    const repoRow = await insertRepo('golang', 'go', null);
    await insertSubscription('unconfirmed@example.com', repoRow.id, false);

    await getService().scan();

    const message = await consumeOneNotification(
      getQueueManager().getChannel(),
    );
    expect(message).toBeNull();
  });

  it('publishes notifications with the correct payload for all confirmed subscribers', async () => {
    const repoRow = await insertRepo('facebook', 'react', 'v18.0.0');
    const aliceSub = await insertSubscription(
      'alice@example.com',
      repoRow.id,
      true,
    );
    const bobSub = await insertSubscription(
      'bob@example.com',
      repoRow.id,
      true,
    );

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

    await getService().scan();

    const message = await consumeOneNotification(
      getQueueManager().getChannel(),
    );

    expect(message).not.toBeNull();
    expect(message!.subscribers).toHaveLength(2);
    expect(message!.subscribers).toEqual(
      expect.arrayContaining([
        {
          email: 'alice@example.com',
          unsubscribeToken: aliceSub.unsubscribeToken,
        },
        { email: 'bob@example.com', unsubscribeToken: bobSub.unsubscribeToken },
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

    await getService().scan();

    const message = await consumeOneNotification(
      getQueueManager().getChannel(),
    );
    expect(message).not.toBeNull();
    expect(message!.newTag).toBe('v1.0.0');

    const updatedRepo = await getRepoById(repoRow.id);
    expect(updatedRepo?.lastSeenTag).toBe('v1.0.0');
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

    await getService().scan();

    const message = await consumeOneNotification(
      getQueueManager().getChannel(),
    );
    expect(message).not.toBeNull();
    expect(message!.repositoryRepo).toBe('go');

    const updatedB = await getRepoById(repoBRow.id);
    expect(updatedB?.lastSeenTag).toBe('v1.0.0');
  });
});
