import '@/shared/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { server } from './server';
import { db, pool } from '@/infrastructure/database';
import { connectQueue, closeQueue } from '@/infrastructure/queue';
import { setupNotificationQueue } from '@/modules/notification/notification.queue';
import subscriptionRoutes from '@/modules/subscription/subscription.routes';
import { SubscriptionRepository } from '@/modules/subscription/subscription.repository';
import { SubscriptionService } from '@/modules/subscription/subscription.service';
import { GithubClient } from '@/modules/github/github.client';
import { MailerService } from '@/modules/mailer/mailer.service';
import { ScannerService } from '@/modules/scanner/scanner.service';
import { NotificationService } from '@/modules/notification/notification.service';
import { RepositoryRepository } from '@/modules/repository/repository.repository';
import { RepositoryService } from '@/modules/repository/repository.service';
import { appConfig } from '@/shared/config/app.config';
import { githubConfig } from '@/shared/config/github.config';

const start = async () => {
  try {
    await migrate(db, { migrationsFolder: './drizzle/migrations' });

    await connectQueue();
    await setupNotificationQueue();

    const mailer = new MailerService();

    const github = new GithubClient(githubConfig.token);

    // Repository
    const repositoryRepository = new RepositoryRepository(db);
    const repositoryService = new RepositoryService(repositoryRepository);

    // Subscription
    const subscriptionRepository = new SubscriptionRepository(db);
    const subscriptionService = new SubscriptionService(
      subscriptionRepository,
      repositoryService,
      github,
      mailer,
    );

    // Scanner
    const scannerService = new ScannerService(repositoryService, github);

    // Notification
    const notificationService = new NotificationService(mailer);

    await server.register(subscriptionRoutes(subscriptionService), {
      prefix: '/api',
    });

    await server.listen({ port: appConfig.port, host: '0.0.0.0' });

    notificationService.start();
    scannerService.start();

    if (appConfig.nodeEnv === 'development') {
      console.log(server.printRoutes());
    }
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
};

const listeners = ['SIGINT', 'SIGTERM'];
listeners.forEach((signal) => {
  process.on(signal, async () => {
    server.log.info(`Received ${signal}, shutting down gracefully...`);
    await server.close();
    await closeQueue();
    await pool.end();
    process.exit(0);
  });
});

void start();
