import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { ReleaseNotificationPayload } from '@/modules/notification';
import { DLQ_NAME, QUEUE_NAME, RETRY_QUEUE_NAME } from '@/modules/notification';
import { useNotificationTest } from './helpers/notification-test.helper';
import { useQueue } from './helpers/queue.helper';

const MAX_HANDLER_ATTEMPTS = 4;

describe('NotificationService', () => {
  const { getSendReleaseNotificationSpy, getQueueManager, getNotificationQueue } =
    useNotificationTest();

  afterEach(async () => {
    // A test that simulates a send failure (e.g. "one email fails") leaves
    // that message retrying in the background with real delays. Drain it so
    // it can't dead-letter back onto the main queue during a later test.
    const channel = getQueueManager().getChannel();
    await channel.purgeQueue(QUEUE_NAME);
    await channel.purgeQueue(RETRY_QUEUE_NAME);
  });

  it('delivers email to all subscribers when a message appears in the queue', async () => {
    const base = {
      repositoryOwner: 'golang',
      repositoryRepo: 'go',
      newTag: 'v1.22.0',
      releaseUrl: 'https://github.com/golang/go/releases/tag/v1.22.0',
    };

    getNotificationQueue().publish({
      ...base,
      subscriber: {
        email: 'alice@example.com',
        unsubscribeToken: randomUUID(),
      },
    });
    getNotificationQueue().publish({
      ...base,
      subscriber: { email: 'bob@example.com', unsubscribeToken: randomUUID() },
    });

    await vi.waitFor(
      () => {
        expect(getSendReleaseNotificationSpy()).toHaveBeenCalledWith(
          'alice@example.com',
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.any(String),
        );
        expect(getSendReleaseNotificationSpy()).toHaveBeenCalledWith(
          'bob@example.com',
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.any(String),
        );
      },
      { timeout: 10_000 },
    );
  });

  it('passes correct repo, tag, and releaseUrl to the mailer', async () => {
    const token = randomUUID();
    const payload: ReleaseNotificationPayload = {
      repositoryOwner: 'vercel',
      repositoryRepo: 'next.js',
      newTag: 'v15.0.0',
      releaseUrl: 'https://github.com/vercel/next.js/releases/tag/v15.0.0',
      subscriber: { email: 'user@example.com', unsubscribeToken: token },
    };

    getNotificationQueue().publish(payload);

    await vi.waitFor(
      () => {
        expect(getSendReleaseNotificationSpy()).toHaveBeenCalledOnce();
      },
      { timeout: 10_000 },
    );

    expect(getSendReleaseNotificationSpy()).toHaveBeenCalledWith(
      'user@example.com',
      'vercel/next.js',
      'v15.0.0',
      'https://github.com/vercel/next.js/releases/tag/v15.0.0',
      expect.stringContaining(token),
    );
  });

  it('continues delivering to the other subscriber when one email fails', async () => {
    getSendReleaseNotificationSpy().mockImplementation(
      async (
        to: string,
        _repo: string,
        _tag: string,
        _releaseUrl: string,
        _unsubscribeUrl: string,
      ) => {
        if (to === 'bad@example.com') {
          throw new Error('SMTP error');
        }
      },
    );

    const base = {
      repositoryOwner: 'golang',
      repositoryRepo: 'go',
      newTag: 'v1.22.0',
      releaseUrl: 'https://github.com/golang/go/releases/tag/v1.22.0',
    };

    getNotificationQueue().publish({
      ...base,
      subscriber: { email: 'bad@example.com', unsubscribeToken: randomUUID() },
    });
    getNotificationQueue().publish({
      ...base,
      subscriber: { email: 'good@example.com', unsubscribeToken: randomUUID() },
    });

    await vi.waitFor(
      () => {
        expect(getSendReleaseNotificationSpy()).toHaveBeenCalledWith(
          'good@example.com',
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.any(String),
        );
      },
      { timeout: 10_000 },
    );
  });
});

describe('NotificationQueue DLQ', () => {
  const { getQueueManager, getNotificationQueue } = useQueue();

  beforeEach(async () => {
    await getQueueManager().getChannel().purgeQueue(DLQ_NAME);
  });

  it('routes a message to the DLQ after 3 failed handler attempts, pausing between retries', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('handler error'));
    getNotificationQueue().consume(handler);

    getNotificationQueue().publish({
      repositoryOwner: 'test',
      repositoryRepo: 'repo',
      newTag: 'v1.0.0',
      releaseUrl: 'https://github.com/test/repo/releases/tag/v1.0.0',
      subscriber: { email: 'user@example.com', unsubscribeToken: randomUUID() },
    });

    await vi.waitFor(
      async () => {
        const msg = await getQueueManager()
          .getChannel()
          .get(DLQ_NAME, { noAck: true });
        expect(msg).not.toBeFalsy();
      },
      { timeout: 30_000 },
    );

    expect(handler).toHaveBeenCalledTimes(MAX_HANDLER_ATTEMPTS);
  });
});
