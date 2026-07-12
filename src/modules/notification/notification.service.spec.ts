import { describe, it, expect, beforeEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { NotificationService } from './notification.service';
import type { IMailerService } from '@/modules/mailer';
import type { INotificationConsumer } from './interfaces/notification.consumer.interface';
import type { ReleaseNotificationPayload } from './notification.schemas';
import type { SubscriberInfo } from '@/shared/types';
import type { ILogger } from '@/shared/logger/logger.interface';
import type { INotificationMetrics } from './interfaces/notification-metrics.interface';
import { buildUnsubscribeUrl } from '@/shared/utils/url-builders';

const SUBSCRIBER_ALICE: SubscriberInfo = {
  email: 'alice@example.com',
  unsubscribeToken: '00000000-0000-0000-0000-000000000001',
};

const MOCK_PAYLOAD: ReleaseNotificationPayload = {
  repositoryOwner: 'acc',
  repositoryRepo: 'testName',
  newTag: 'v2.0.0',
  releaseUrl: 'https://github.com/acc/testName/releases/tag/v2.0.0',
  subscriber: SUBSCRIBER_ALICE,
};

describe('NotificationService', () => {
  let service: NotificationService;
  let mailer: ReturnType<typeof mock<IMailerService>>;
  let notificationConsumer: ReturnType<typeof mock<INotificationConsumer>>;
  let logger: ReturnType<typeof mock<ILogger>>;
  let metrics: ReturnType<typeof mock<INotificationMetrics>>;
  let capturedHandler: (payload: ReleaseNotificationPayload) => Promise<void>;

  beforeEach(() => {
    mailer = mock<IMailerService>();
    mailer.sendReleaseNotification.mockResolvedValue(undefined);

    notificationConsumer = mock<INotificationConsumer>();
    notificationConsumer.consume.mockImplementation((handler) => {
      capturedHandler = handler;
    });

    logger = mock<ILogger>();
    metrics = mock<INotificationMetrics>();

    service = new NotificationService(
      mailer,
      notificationConsumer,
      logger,
      metrics,
      { appUrl: 'http://localhost:3000' },
    );
  });

  describe('start', () => {
    it('should register a consumer on the notification queue', () => {
      service.start();

      expect(notificationConsumer.consume).toHaveBeenCalledOnce();
      expect(notificationConsumer.consume).toHaveBeenCalledWith(
        expect.any(Function),
      );
    });
  });

  describe('message handler', () => {
    beforeEach(() => {
      service.start();
    });

    describe('email sending', () => {
      it('should send a release notification for the subscriber', async () => {
        await capturedHandler(MOCK_PAYLOAD);

        expect(mailer.sendReleaseNotification).toHaveBeenCalledOnce();
      });

      it('should pass the correct recipient, repo string, tag, and release URL to the mailer', async () => {
        await capturedHandler(MOCK_PAYLOAD);

        expect(mailer.sendReleaseNotification).toHaveBeenCalledWith(
          SUBSCRIBER_ALICE.email,
          'acc/testName',
          MOCK_PAYLOAD.newTag,
          MOCK_PAYLOAD.releaseUrl,
          expect.any(String),
        );
      });

      it('should pass the correct unsubscribe URL for the subscriber to the mailer', async () => {
        await capturedHandler(MOCK_PAYLOAD);

        const aliceUrl = buildUnsubscribeUrl(
          SUBSCRIBER_ALICE.unsubscribeToken,
          'http://localhost:3000',
        );

        expect(mailer.sendReleaseNotification).toHaveBeenCalledWith(
          SUBSCRIBER_ALICE.email,
          expect.any(String),
          expect.any(String),
          expect.any(String),
          aliceUrl,
        );
      });
    });

    describe('when the email is sent successfully', () => {
      it('should increment the success counter', async () => {
        await capturedHandler(MOCK_PAYLOAD);

        expect(metrics.incSent).toHaveBeenCalledExactlyOnceWith('success');
      });

      it('should not increment the failure counter', async () => {
        await capturedHandler(MOCK_PAYLOAD);

        expect(metrics.incSent).not.toHaveBeenCalledWith('failure');
      });

      it('should resolve without throwing', async () => {
        await expect(capturedHandler(MOCK_PAYLOAD)).resolves.toBeUndefined();
      });
    });

    describe('when the email fails to send', () => {
      const smtpError = new Error('SMTP connection refused');

      beforeEach(() => {
        mailer.sendReleaseNotification.mockRejectedValue(smtpError);
      });

      it('should increment the failure counter', async () => {
        await capturedHandler(MOCK_PAYLOAD).catch(() => {});

        expect(metrics.incSent).toHaveBeenCalledExactlyOnceWith('failure');
      });

      it('should not increment the success counter', async () => {
        await capturedHandler(MOCK_PAYLOAD).catch(() => {});

        expect(metrics.incSent).not.toHaveBeenCalledWith('success');
      });

      it('should log the failure with the recipient email and repo', async () => {
        await capturedHandler(MOCK_PAYLOAD).catch(() => {});

        expect(logger.error).toHaveBeenCalledWith(
          {
            err: smtpError,
            email: SUBSCRIBER_ALICE.email,
            repo: 'acc/testName',
          },
          '[Notifier] Failed to send release email',
        );
      });

      it('should rethrow so the queue can retry or dead-letter the message', async () => {
        await expect(capturedHandler(MOCK_PAYLOAD)).rejects.toThrow(smtpError);
      });
    });
  });
});
