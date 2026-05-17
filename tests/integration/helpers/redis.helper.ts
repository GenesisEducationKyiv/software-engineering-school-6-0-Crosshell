import Redis from 'ioredis';
import { beforeAll, afterAll, beforeEach } from 'vitest';

export function useRedis(): { getRedis: () => Redis } {
  let redisClient: Redis;

  beforeAll(() => {
    redisClient = new Redis(process.env['REDIS_URL']!);
  });

  afterAll(async () => {
    await redisClient.quit();
  });

  beforeEach(async () => {
    await redisClient.flushall();
  });

  return {
    getRedis: () => redisClient,
  };
}
