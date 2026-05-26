import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  vi,
  type MockInstance,
} from 'vitest';
import { randomUUID } from 'node:crypto';
import type { IMailerService } from '@/modules/mailer/interfaces/mailer.service.interface';
import { NotificationService } from '@/modules/notification/notification.service';
import type { ReleaseNotificationPayload } from '@/modules/notification/notification.schemas';
import { NotificationMetrics } from '@/infrastructure/metrics/notification-metrics';
import { logger } from '@/shared/logger';
import type { NotificationQueue } from '@/modules/notification/notification.queue';
import { useQueue } from './helpers/queue.helper';
import { createTestMailer } from './helpers/mailer.helper';

function buildNotificationService(
  mailer: IMailerService,
  queue: NotificationQueue,
): NotificationService {
  return new NotificationService(
    mailer,
    queue,
    logger,
    new NotificationMetrics(),
    { appUrl: 'http://localhost:3000' },
  );
}

const DLQ_NAME = 'release.notifications.dead';

describe('NotificationService', () => {
  const { getNotificationQueue } = useQueue();

  let mailer: IMailerService;
  let sendReleaseNotificationSpy: MockInstance;

  beforeAll(() => {
    mailer = createTestMailer();
    sendReleaseNotificationSpy = vi
      .spyOn(mailer, 'sendReleaseNotification')
      .mockResolvedValue(undefined);

    buildNotificationService(mailer, getNotificationQueue()).start();
  });

  beforeEach(() => {
    sendReleaseNotificationSpy.mockResolvedValue(undefined);
  });

  it('delivers email to all subscribers when a message appears in the queue', async () => {
    const payload: ReleaseNotificationPayload = {
      repositoryOwner: 'golang',
      repositoryRepo: 'go',
      newTag: 'v1.22.0',
      releaseUrl: 'https://github.com/golang/go/releases/tag/v1.22.0',
      subscribers: [
        { email: 'alice@example.com', unsubscribeToken: randomUUID() },
        { email: 'bob@example.com', unsubscribeToken: randomUUID() },
      ],
    };

    getNotificationQueue().publish(payload);

    await vi.waitFor(
      () => {
        expect(sendReleaseNotificationSpy).toHaveBeenCalledTimes(2);
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
      subscribers: [{ email: 'user@example.com', unsubscribeToken: token }],
    };

    getNotificationQueue().publish(payload);

    await vi.waitFor(
      () => {
        expect(sendReleaseNotificationSpy).toHaveBeenCalledOnce();
      },
      { timeout: 10_000 },
    );

    expect(sendReleaseNotificationSpy).toHaveBeenCalledWith(
      'user@example.com',
      'vercel/next.js',
      'v15.0.0',
      'https://github.com/vercel/next.js/releases/tag/v15.0.0',
      expect.stringContaining(token),
    );
  });

  it('continues delivering to other subscribers when one email fails', async () => {
    sendReleaseNotificationSpy.mockImplementation(
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

    const payload: ReleaseNotificationPayload = {
      repositoryOwner: 'golang',
      repositoryRepo: 'go',
      newTag: 'v1.22.0',
      releaseUrl: 'https://github.com/golang/go/releases/tag/v1.22.0',
      subscribers: [
        { email: 'bad@example.com', unsubscribeToken: randomUUID() },
        { email: 'good@example.com', unsubscribeToken: randomUUID() },
      ],
    };

    getNotificationQueue().publish(payload);

    await vi.waitFor(
      () => {
        expect(sendReleaseNotificationSpy).toHaveBeenCalledTimes(2);
      },
      { timeout: 10_000 },
    );

    expect(sendReleaseNotificationSpy).toHaveBeenCalledWith(
      'good@example.com',
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
    );
  });
});

describe('NotificationQueue DLQ', () => {
  const { getQueueManager, getNotificationQueue } = useQueue();

  beforeEach(async () => {
    await getQueueManager().getChannel().purgeQueue(DLQ_NAME);
  });

  it('routes a message to the DLQ after 3 failed handler attempts', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('handler error'));
    getNotificationQueue().consume(handler);

    getNotificationQueue().publish({
      repositoryOwner: 'test',
      repositoryRepo: 'repo',
      newTag: 'v1.0.0',
      releaseUrl: 'https://github.com/test/repo/releases/tag/v1.0.0',
      subscribers: [
        { email: 'user@example.com', unsubscribeToken: randomUUID() },
      ],
    });

    await vi.waitFor(
      async () => {
        const msg = await getQueueManager()
          .getChannel()
          .get(DLQ_NAME, { noAck: true });
        expect(msg).not.toBeFalsy();
      },
      { timeout: 15_000 },
    );
  });
});
