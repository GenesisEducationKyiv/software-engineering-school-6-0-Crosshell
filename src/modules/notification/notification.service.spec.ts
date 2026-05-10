import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { NotificationService } from './notification.service';
import type { IMailerService } from '@/modules/mailer/mailer.service.interface';
import type { INotificationConsumer } from '@/modules/notification/notification.consumer.interface';
import type { ReleaseNotificationPayload } from '@/modules/notification/notification.schemas';
import type { Subscriber } from '@/modules/notification/notification.schemas';

vi.mock('@/modules/notification/notification.urls', () => ({
  buildUnsubscribeUrl: vi.fn(
    (token: string) => `http://localhost:3000/api/unsubscribe/${token}`,
  ),
}));

vi.mock('@/shared/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/infrastructure/metrics/metrics.registry', () => ({
  notificationsSentTotal: { inc: vi.fn() },
}));

import { buildUnsubscribeUrl } from '@/modules/notification/notification.urls';
import { logger } from '@/shared/logger';
import { notificationsSentTotal } from '@/infrastructure/metrics/metrics.registry';

const SUBSCRIBER_ALICE: Subscriber = {
  email: 'alice@example.com',
  unsubscribeToken: '00000000-0000-0000-0000-000000000001',
};

const SUBSCRIBER_BOB: Subscriber = {
  email: 'bob@example.com',
  unsubscribeToken: '00000000-0000-0000-0000-000000000002',
};

const MOCK_PAYLOAD: ReleaseNotificationPayload = {
  repositoryOwner: 'acc',
  repositoryRepo: 'testName',
  newTag: 'v2.0.0',
  releaseUrl: 'https://github.com/acc/testName/releases/tag/v2.0.0',
  subscribers: [SUBSCRIBER_ALICE, SUBSCRIBER_BOB],
};

describe('NotificationService', () => {
  let service: NotificationService;
  let mailer: ReturnType<typeof mock<IMailerService>>;
  let notificationConsumer: ReturnType<typeof mock<INotificationConsumer>>;
  let capturedHandler: (payload: ReleaseNotificationPayload) => Promise<void>;

  beforeEach(() => {
    mailer = mock<IMailerService>();
    mailer.sendReleaseNotification.mockResolvedValue(undefined);

    notificationConsumer = mock<INotificationConsumer>();
    notificationConsumer.consume.mockImplementation((handler) => {
      capturedHandler = handler;
    });

    service = new NotificationService(mailer, notificationConsumer);
  });

  describe('start', () => {
    it('should register a consumer on the notification queue', () => {
      service.start();

      expect(notificationConsumer.consume).toHaveBeenCalledOnce();
      expect(notificationConsumer.consume).toHaveBeenCalledWith(
        expect.any(Function),
      );
    });

    it('should log that the service is listening', () => {
      service.start();

      expect(logger.info).toHaveBeenCalledWith(
        '[Notifier] Listening for release notifications',
      );
    });
  });

  describe('message handler', () => {
    beforeEach(() => {
      service.start();
    });

    describe('email sending', () => {
      it('should send a release notification for every subscriber', async () => {
        await capturedHandler(MOCK_PAYLOAD);

        expect(mailer.sendReleaseNotification).toHaveBeenCalledTimes(2);
      });

      it('should pass the correct repo string, tag, and release URL to the mailer', async () => {
        await capturedHandler(MOCK_PAYLOAD);

        expect(mailer.sendReleaseNotification).toHaveBeenCalledWith(
          SUBSCRIBER_ALICE.email,
          'acc/testName',
          MOCK_PAYLOAD.newTag,
          MOCK_PAYLOAD.releaseUrl,
          expect.any(String),
        );
      });

      it('should build an unsubscribe URL for each subscriber token', async () => {
        await capturedHandler(MOCK_PAYLOAD);

        expect(buildUnsubscribeUrl).toHaveBeenCalledWith(
          SUBSCRIBER_ALICE.unsubscribeToken,
        );
        expect(buildUnsubscribeUrl).toHaveBeenCalledWith(
          SUBSCRIBER_BOB.unsubscribeToken,
        );
      });

      it('should pass the built unsubscribe URL to the mailer', async () => {
        await capturedHandler(MOCK_PAYLOAD);

        const expectedUrl = `http://localhost:3000/api/unsubscribe/${SUBSCRIBER_ALICE.unsubscribeToken}`;
        expect(mailer.sendReleaseNotification).toHaveBeenCalledWith(
          SUBSCRIBER_ALICE.email,
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expectedUrl,
        );
      });
    });

    describe('when all emails are sent successfully', () => {
      it('should increment the success counter for each subscriber', async () => {
        await capturedHandler(MOCK_PAYLOAD);

        expect(notificationsSentTotal.inc).toHaveBeenCalledTimes(2);
        expect(notificationsSentTotal.inc).toHaveBeenCalledWith({
          status: 'success',
        });
      });

      it('should not increment the failure counter', async () => {
        await capturedHandler(MOCK_PAYLOAD);

        expect(notificationsSentTotal.inc).not.toHaveBeenCalledWith({
          status: 'failure',
        });
      });

      it('should not log any error', async () => {
        await capturedHandler(MOCK_PAYLOAD);

        expect(logger.error).not.toHaveBeenCalled();
      });
    });

    describe('when one email fails to send', () => {
      const smtpError = new Error('SMTP connection refused');

      beforeEach(() => {
        mailer.sendReleaseNotification.mockImplementation((email) => {
          if (email === SUBSCRIBER_ALICE.email)
            return Promise.reject(smtpError);
          return Promise.resolve();
        });
      });

      it('should still send a notification to the remaining subscriber', async () => {
        await capturedHandler(MOCK_PAYLOAD);

        expect(mailer.sendReleaseNotification).toHaveBeenCalledWith(
          SUBSCRIBER_BOB.email,
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.any(String),
        );
      });

      it('should increment the failure counter for the failed subscriber', async () => {
        await capturedHandler(MOCK_PAYLOAD);

        expect(notificationsSentTotal.inc).toHaveBeenCalledWith({
          status: 'failure',
        });
      });

      it('should increment the success counter for the successful subscriber', async () => {
        await capturedHandler(MOCK_PAYLOAD);

        expect(notificationsSentTotal.inc).toHaveBeenCalledWith({
          status: 'success',
        });
      });

      it('should log an error with the failed email, repo, and error details', async () => {
        await capturedHandler(MOCK_PAYLOAD);

        expect(logger.error).toHaveBeenCalledWith(
          {
            err: smtpError,
            email: SUBSCRIBER_ALICE.email,
            repo: 'acc/testName',
          },
          '[Notifier] Failed to send release email',
        );
      });
    });

    describe('when all emails fail to send', () => {
      beforeEach(() => {
        mailer.sendReleaseNotification.mockRejectedValue(
          new Error('SMTP down'),
        );
      });

      it('should increment the failure counter for every subscriber', async () => {
        await capturedHandler(MOCK_PAYLOAD);

        expect(notificationsSentTotal.inc).toHaveBeenCalledTimes(2);
        expect(notificationsSentTotal.inc).toHaveBeenCalledWith({
          status: 'failure',
        });
        expect(notificationsSentTotal.inc).not.toHaveBeenCalledWith({
          status: 'success',
        });
      });

      it('should log an error for each failed subscriber', async () => {
        await capturedHandler(MOCK_PAYLOAD);

        expect(logger.error).toHaveBeenCalledTimes(2);
      });

      it('should resolve without throwing even if all sends fail', async () => {
        await expect(capturedHandler(MOCK_PAYLOAD)).resolves.toBeUndefined();
      });
    });

    describe('when there is a single subscriber', () => {
      it('should send exactly one notification', async () => {
        const singleSubscriberPayload: ReleaseNotificationPayload = {
          ...MOCK_PAYLOAD,
          subscribers: [SUBSCRIBER_ALICE],
        };

        await capturedHandler(singleSubscriberPayload);

        expect(mailer.sendReleaseNotification).toHaveBeenCalledOnce();
      });
    });
  });
});
