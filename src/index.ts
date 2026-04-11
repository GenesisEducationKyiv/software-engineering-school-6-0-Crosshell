import '@/shared/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { server } from './server';
import { db, pool } from '@/infrastructure/database';
import { QueueManager } from '@/infrastructure/queue/queue-manager';
import { NotificationQueue } from '@/modules/notification/notification.queue';
import subscriptionRoutes from '@/modules/subscription/subscription.routes';
import { logger } from '@/shared/logger';
import { createContainer } from '@/container';
import { registerGracefulShutdown } from '@/shared/lifecycle/graceful-shutdown';
import { appConfig } from '@/shared/config';

const start = async () => {
  try {
    await migrate(db, { migrationsFolder: './drizzle/migrations' });

    const queueManager = new QueueManager();
    await queueManager.connect();

    const notificationQueue = new NotificationQueue(queueManager);
    await notificationQueue.setup();

    const { subscriptionService, scannerService, notificationService } =
      createContainer(notificationQueue);

    registerGracefulShutdown({ server, queueManager, pool });

    await server.register(subscriptionRoutes(subscriptionService), {
      prefix: '/api',
    });

    await server.listen({ port: appConfig.port, host: '0.0.0.0' });

    notificationService.start();
    scannerService.start();

    queueManager.setReconnectHandler(async () => {
      await notificationQueue.setup();
      notificationService.start();
    });

    if (appConfig.nodeEnv === 'development') {
      console.log(server.printRoutes());
    }
  } catch (error) {
    logger.error(error);
    process.exit(1);
  }
};

void start();
