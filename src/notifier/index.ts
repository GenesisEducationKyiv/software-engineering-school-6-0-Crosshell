import 'dotenv/config';
import { queueConfig } from '@/shared/config/queue.config';
import { mailerConfig } from '@/shared/config/mailer.config';
import { appConfig } from '@/shared/config/app.config';
import { QueueManager } from '@/infrastructure/queue/queue-manager';
import { NotificationQueue, NotificationService } from '@/modules/notification';
import { MailerService, NodemailerEmailTransport } from '@/modules/mailer';
import { NotificationMetrics } from '@/infrastructure/metrics/notification-metrics';
import { SagaCommandsQueue } from '@/infrastructure/queue/saga-commands.queue';
import { SagaCommandHandler } from './saga-command.handler';
import { logger } from '@/shared/logger';
import nodemailer from 'nodemailer';

const start = async () => {
  try {
    const queueManager = new QueueManager({ url: queueConfig.url });
    await queueManager.connect();

    const notificationQueue = new NotificationQueue(queueManager, logger);
    await notificationQueue.setup();

    const transporter = nodemailer.createTransport({
      host: mailerConfig.host,
      port: mailerConfig.port,
      auth: {
        user: mailerConfig.user,
        pass: mailerConfig.pass,
      },
    });
    const mailer = new MailerService(
      new NodemailerEmailTransport(transporter),
      { from: mailerConfig.from },
    );

    const notificationService = new NotificationService(
      mailer,
      notificationQueue,
      logger,
      new NotificationMetrics(),
      { appUrl: appConfig.appUrl },
    );

    const sagaCommandsQueue = new SagaCommandsQueue(queueManager, logger);
    await sagaCommandsQueue.setup();

    const sagaCommandHandler = new SagaCommandHandler(
      mailer,
      sagaCommandsQueue,
      logger,
    );

    const startConsumers = (): void => {
      notificationService.start();
      sagaCommandHandler.start();
    };

    startConsumers();

    queueManager.setReconnectHandler(async () => {
      await notificationQueue.setup();
      await sagaCommandsQueue.setup();
      startConsumers();
    });

    const shutdown = async (signal: string) => {
      logger.info(`[Notifier] Received ${signal}, shutting down...`);
      await queueManager.close();
      process.exit(0);
    };

    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.on(signal, () => void shutdown(signal));
    }

    logger.info('[Notifier] Service started');
  } catch (error) {
    logger.error({ err: error }, '[Notifier] Startup failed');
    process.exit(1);
  }
};

void start();
