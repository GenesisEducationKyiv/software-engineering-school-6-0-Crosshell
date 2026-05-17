import type { Redis } from 'ioredis';
import type { ZodType } from 'zod';
import { logger } from '@/shared/logger';
import type { ICacheService } from './interfaces/cache.service.interface';

export class CacheService implements ICacheService {
  constructor(private readonly client: Redis) {}

  async get<T>(key: string, schema: ZodType<T>): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      if (!raw) return null;
      const parsed = schema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        logger.warn(
          { key, issues: parsed.error.issues },
          '[Cache] Stale or invalid data, cache miss',
        );
        return null;
      }
      return parsed.data;
    } catch (err) {
      logger.warn({ err, key }, '[Cache] Get failed');
      return null;
    }
  }

  async setWithExpiry(
    key: string,
    value: unknown,
    ttlSeconds: number,
  ): Promise<void> {
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      logger.warn({ err, key }, '[Cache] Set failed');
    }
  }

  async quit(): Promise<void> {
    await this.client.quit();
  }
}
