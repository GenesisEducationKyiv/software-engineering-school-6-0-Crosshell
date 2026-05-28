import Redis from 'ioredis';
import { logger } from '@/shared/logger';

export function createRedisClient(url: string): Redis {
  const client = new Redis(url, { lazyConnect: true });

  client.on('connect', () => logger.info('[Redis] Connected'));
  client.on('error', (err: Error) =>
    logger.error({ err }, '[Redis] Connection error'),
  );

  return client;
}
