import { server } from './server';
import subscriptionRoutes from '@/modules/subscription/subscription.routes';

const start = async () => {
  try {
    await server.register(subscriptionRoutes, {
      prefix: '/api/v1/subscriptions',
    });

    server.get('/health', async () => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
    }));

    const port = parseInt(process.env.API_PORT || '3000', 10);
    await server.listen({ port, host: '0.0.0.0' });

    if (process.env.NODE_ENV === 'development') {
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
    process.exit(0);
  });
});

void start();
