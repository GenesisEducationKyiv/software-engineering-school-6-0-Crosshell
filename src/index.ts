import '@/shared/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { server } from './server';
import { db, pool } from '@/infrastructure/database';
import { QueueManager } from '@/infrastructure/queue/queue-manager';
import { NotificationQueue } from '@/modules/notification/notification.queue';
import subscriptionRoutes from '@/modules/subscription/subscription.routes';
import {
  createSubscriptionGrpcHandlers,
  getSubscriptionServiceDefinition,
} from '@/modules/subscription/subscription.grpc';
import { GrpcServer } from '@/infrastructure/grpc/grpc-server';
import { logger } from '@/shared/logger';
import { createContainer } from '@/container';
import { registerGracefulShutdown } from '@/shared/lifecycle/graceful-shutdown';
import { appConfig, grpcConfig } from '@/shared/config';

const start = async () => {
  try {
    await migrate(db, { migrationsFolder: './drizzle/migrations' });

    const queueManager = new QueueManager();
    await queueManager.connect();

    const notificationQueue = new NotificationQueue(queueManager);
    await notificationQueue.setup();

    const { subscriptionService, scannerService, notificationService } =
      createContainer(notificationQueue);

    const grpcServer = new GrpcServer();
    grpcServer.addService(
      getSubscriptionServiceDefinition(),
      createSubscriptionGrpcHandlers(subscriptionService),
    );

    registerGracefulShutdown({ server, grpcServer, queueManager, pool });

    await server.register(subscriptionRoutes(subscriptionService), {
      prefix: '/api',
    });

    await server.listen({ port: appConfig.port, host: '0.0.0.0' });
    await grpcServer.start(grpcConfig.port);

    notificationService.start();
    scannerService.start();

    queueManager.setReconnectHandler(async () => {
      await notificationQueue.setup();
      notificationService.start();
    });

    if (appConfig.nodeEnv === 'development') {
      console.log(server.printRoutes({ commonPrefix: false }));
    }
  } catch (error) {
    logger.error(error);
    process.exit(1);
  }
};

void start();
