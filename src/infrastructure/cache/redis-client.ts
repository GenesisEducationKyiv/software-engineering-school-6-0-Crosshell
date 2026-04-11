import Redis from 'ioredis';
import { redisConfig } from '@/shared/config';
import { logger } from '@/shared/logger';

export function createRedisClient(): Redis {
  const client = new Redis(redisConfig.url, { lazyConnect: true });

  client.on('connect', () => logger.info('[Redis] Connected'));
  client.on('error', (err: Error) =>
    logger.error({ err }, '[Redis] Connection error'),
  );

  return client;
}
