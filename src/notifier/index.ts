import 'dotenv/config';
import Fastify from 'fastify';
import type { FastifyBaseLogger } from 'fastify';
import { queueConfig } from '@/shared/config/queue.config';
import { appConfig } from '@/shared/config/app.config';
import { notifierWorkerConfig } from '@/shared/config/notifier-worker.config';
import {
  createNotificationQueue,
  NotificationService,
} from '@/modules/notification';
import { createMailerService } from '@/modules/mailer';
import { NotificationMetrics } from '@/infrastructure/metrics/notification-metrics';
import { SagaCommandsQueue } from '@/modules/saga/saga-commands.queue';
import { SagaCommandHandler } from './saga-command.handler';
import { logger } from '@/shared/logger';
import { registerGracefulShutdown } from '@/shared/lifecycle/graceful-shutdown';
import healthPlugin from '@/shared/plugins/health.plugin';
import metricsPlugin from '@/shared/plugins/metrics.plugin';

const start = async () => {
  try {
    const { queueManager, notificationQueue } = await createNotificationQueue(
      { url: queueConfig.url },
      logger,
    );

    const mailer = createMailerService();

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

    const workerServer = Fastify({
      loggerInstance: logger as FastifyBaseLogger,
    });

    await workerServer.register(healthPlugin, {
      probe: async () => {
        if (!queueManager.isHealthy()) {
          throw new Error('Queue connection is not healthy');
        }
      },
    });
    await workerServer.register(metricsPlugin);

    await workerServer.listen({
      port: notifierWorkerConfig.port,
      host: '0.0.0.0',
    });

    registerGracefulShutdown([workerServer, queueManager]);

    logger.info('[Notifier] Service started');
  } catch (error) {
    logger.error({ err: error }, '[Notifier] Startup failed');
    process.exit(1);
  }
};

void start();
