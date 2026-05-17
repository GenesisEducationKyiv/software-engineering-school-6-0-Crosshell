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
import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import { MailerService } from '@/modules/mailer/mailer.service';
import type { IMailerService } from '@/modules/mailer/mailer.service.interface';
import { NotificationQueue } from '@/modules/notification/notification.queue';
import { NotificationService } from '@/modules/notification/notification.service';
import { QueueManager } from '@/infrastructure/queue/queue-manager';
import type { ReleaseNotificationPayload } from '@/modules/notification/notification.schemas';
import { purgeNotificationQueue } from './helpers/queue.helper';

const DLQ_NAME = 'release.notifications.dead';

describe('NotificationService', () => {
  let queueManager: QueueManager;
  let notificationQueue: NotificationQueue;
  let mailer: IMailerService;
  let sendReleaseNotificationSpy: MockInstance;

  beforeAll(async () => {
    queueManager = new QueueManager();
    await queueManager.connect();

    notificationQueue = new NotificationQueue(queueManager);
    await notificationQueue.setup();

    mailer = new MailerService(
      nodemailer.createTransport({ jsonTransport: true }),
    );

    sendReleaseNotificationSpy = vi
      .spyOn(mailer, 'sendReleaseNotification')
      .mockResolvedValue(undefined);

    const notificationService = new NotificationService(
      mailer,
      notificationQueue,
    );
    notificationService.start();
  });

  afterAll(async () => {
    await queueManager.close();
  });

  beforeEach(async () => {
    await purgeNotificationQueue(queueManager.getChannel());
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

    notificationQueue.publish(payload);

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

    notificationQueue.publish(payload);

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
        if (to === 'bad@example.com') throw new Error('SMTP error');
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

    notificationQueue.publish(payload);

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
  let queueManager: QueueManager;
  let notificationQueue: NotificationQueue;

  beforeAll(async () => {
    queueManager = new QueueManager();
    await queueManager.connect();

    notificationQueue = new NotificationQueue(queueManager);
    await notificationQueue.setup();
  });

  afterAll(async () => {
    await queueManager.close();
  });

  beforeEach(async () => {
    await purgeNotificationQueue(queueManager.getChannel());
    await queueManager.getChannel().purgeQueue(DLQ_NAME);
  });

  it('routes a message to the DLQ after 3 failed handler attempts', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('handler error'));
    notificationQueue.consume(handler);

    notificationQueue.publish({
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
        const msg = await queueManager
          .getChannel()
          .get(DLQ_NAME, { noAck: true });
        expect(msg).not.toBeFalsy();
      },
      { timeout: 15_000 },
    );
  });
});
