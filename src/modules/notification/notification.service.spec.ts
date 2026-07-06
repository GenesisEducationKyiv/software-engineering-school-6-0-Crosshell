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

const SUBSCRIBER_BOB: SubscriberInfo = {
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

      it('should pass the correct unsubscribe URL for each subscriber to the mailer', async () => {
        await capturedHandler(MOCK_PAYLOAD);

        const aliceUrl = buildUnsubscribeUrl(
          SUBSCRIBER_ALICE.unsubscribeToken,
          'http://localhost:3000',
        );
        const bobUrl = buildUnsubscribeUrl(
          SUBSCRIBER_BOB.unsubscribeToken,
          'http://localhost:3000',
        );

        expect(mailer.sendReleaseNotification).toHaveBeenCalledWith(
          SUBSCRIBER_ALICE.email,
          expect.any(String),
          expect.any(String),
          expect.any(String),
          aliceUrl,
        );
        expect(mailer.sendReleaseNotification).toHaveBeenCalledWith(
          SUBSCRIBER_BOB.email,
          expect.any(String),
          expect.any(String),
          expect.any(String),
          bobUrl,
        );
      });
    });

    describe('when all emails are sent successfully', () => {
      it('should increment the success counter for each subscriber', async () => {
        await capturedHandler(MOCK_PAYLOAD);

        expect(metrics.incSent).toHaveBeenCalledTimes(2);
        expect(metrics.incSent).toHaveBeenCalledWith('success');
      });

      it('should not increment the failure counter', async () => {
        await capturedHandler(MOCK_PAYLOAD);

        expect(metrics.incSent).not.toHaveBeenCalledWith('failure');
      });
    });

    describe('when one email fails to send', () => {
      const smtpError = new Error('SMTP connection refused');

      beforeEach(() => {
        mailer.sendReleaseNotification.mockImplementation(async (email) => {
          if (email === SUBSCRIBER_ALICE.email) {
            throw smtpError;
          }
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

        expect(metrics.incSent).toHaveBeenCalledWith('failure');
      });

      it('should increment the success counter for the successful subscriber', async () => {
        await capturedHandler(MOCK_PAYLOAD);

        expect(metrics.incSent).toHaveBeenCalledWith('success');
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

        expect(metrics.incSent).toHaveBeenCalledTimes(2);
        expect(metrics.incSent).toHaveBeenCalledWith('failure');
        expect(metrics.incSent).not.toHaveBeenCalledWith('success');
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
