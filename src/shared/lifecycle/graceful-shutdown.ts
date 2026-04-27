import { logger } from '@/shared/logger';

export interface AppResources {
  server: { close(): Promise<void> };
  grpcServer: { close(): Promise<void> };
  queueManager: { close(): Promise<void> };
  pool: { end(): Promise<void> };
  cache: { quit(): Promise<void> };
}

export function registerGracefulShutdown(resources: AppResources): void {
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    await resources.server.close();
    await resources.grpcServer.close();
    await resources.queueManager.close();
    await resources.pool.end();
    await resources.cache.quit();
    process.exit(0);
  };

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => void shutdown(signal));
  }
}
