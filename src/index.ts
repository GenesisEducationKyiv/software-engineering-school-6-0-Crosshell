import 'dotenv/config';
import '@/shared/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { server } from './server';
import healthPlugin from '@/shared/plugins/health.plugin';
import { db, pool } from '@/infrastructure/database';
import { QueueManager } from '@/infrastructure/queue/queue-manager';
import { NotificationQueue } from '@/modules/notification';
import { SagaCommandsQueue } from '@/infrastructure/queue/saga-commands.queue';
import {
  subscriptionRoutes,
  createSubscriptionGrpcHandlers,
  getSubscriptionServiceDefinition,
} from '@/modules/subscription';
import { GrpcServer } from '@/infrastructure/grpc/grpc-server';
import { logger } from '@/shared/logger';
import { createContainer } from '@/container';
import { registerGracefulShutdown } from '@/shared/lifecycle/graceful-shutdown';
import type { Closeable } from '@/shared/lifecycle/graceful-shutdown';
import {
  appConfig,
  grpcConfig,
  queueConfig,
  redisConfig,
} from '@/shared/config';
import { createRedisClient } from '@/infrastructure/cache/redis-client';
import { CacheService } from '@/infrastructure/cache/cache.service';

const RECOVERY_GRACE_MS = 2_000;

const start = async () => {
  try {
    await migrate(db, { migrationsFolder: './drizzle/migrations' });

    const redisClient = createRedisClient(redisConfig.url);
    await redisClient.connect();
    const cache = new CacheService(redisClient, logger);

    await server.register(healthPlugin, {
      probe: async () => {
        await pool.query('SELECT 1');
        await redisClient.ping();
      },
    });

    const queueManager = new QueueManager({ url: queueConfig.url });
    await queueManager.connect();

    const notificationQueue = new NotificationQueue(queueManager, logger);
    await notificationQueue.setup();

    const sagaCommandsQueue = new SagaCommandsQueue(queueManager, logger);
    await sagaCommandsQueue.setup();

    const {
      subscriptionService,
      scannerService,
      subscribeSagaOrchestrator,
      grpcConfirmationEmailSender,
    } = createContainer(notificationQueue, sagaCommandsQueue, cache, logger);

    subscribeSagaOrchestrator.startReplyConsumer();

    await new Promise((resolve) => setTimeout(resolve, RECOVERY_GRACE_MS));
    await subscribeSagaOrchestrator.recoverPendingSagas();

    const grpcServer = new GrpcServer();
    grpcServer.addService(
      getSubscriptionServiceDefinition(),
      createSubscriptionGrpcHandlers(
        subscriptionService,
        subscribeSagaOrchestrator,
        appConfig.apiKey,
      ),
    );

    const shutdownResources: Closeable[] = [
      server,
      grpcServer,
      queueManager,
      { close: () => pool.end() },
      { close: () => cache.quit() },
    ];
    if (grpcConfirmationEmailSender) {
      shutdownResources.push(grpcConfirmationEmailSender);
    }
    registerGracefulShutdown(shutdownResources);

    await server.register(
      subscriptionRoutes(subscriptionService, subscribeSagaOrchestrator),
      {
        prefix: '/api',
      },
    );

    await server.listen({ port: appConfig.port, host: '0.0.0.0' });
    await grpcServer.start(grpcConfig.port);

    scannerService.start();

    queueManager.setReconnectHandler(async () => {
      await notificationQueue.setup();
      await sagaCommandsQueue.setup();
      subscribeSagaOrchestrator.startReplyConsumer();
    });

    if (appConfig.nodeEnv === 'development') {
      console.log(server.printRoutes({ commonPrefix: false }));
    }
  } catch (error) {
    logger.error({ err: error }, 'Startup failed');
    process.exit(1);
  }
};

void start();
