import type { Redis } from 'ioredis';
import type { ZodType } from 'zod';
import type { ILogger } from '@/shared/logger/logger.interface';
import type { ICacheService } from './interfaces/cache.service.interface';

export class CacheService implements ICacheService {
  constructor(
    private readonly client: Redis,
    private readonly logger: ILogger,
  ) {}

  async get<T>(key: string, schema: ZodType<T>): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      if (!raw) {
        return null;
      }
      const parsed = schema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        this.logger.warn(
          { key, issues: parsed.error.issues },
          '[Cache] Stale or invalid data, cache miss',
        );

        return null;
      }

      return parsed.data;
    } catch (err) {
      this.logger.warn({ err, key }, '[Cache] Get failed');

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
      this.logger.warn({ err, key }, '[Cache] Set failed');
    }
  }

  async quit(): Promise<void> {
    await this.client.quit();
  }
}
