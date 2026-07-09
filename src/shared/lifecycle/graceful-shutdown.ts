import { logger, flushLogger } from '@/shared/logger';

export interface Closeable {
  close(): Promise<void>;
}

export function registerGracefulShutdown(resources: Closeable[]): void {
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    for (const resource of resources) {
      await resource.close();
    }

    await flushLogger();
    process.exit(0);
  };

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => void shutdown(signal));
  }
}
