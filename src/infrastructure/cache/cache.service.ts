import type { Redis } from 'ioredis';
import type { ILogger } from '@/shared/logger/logger.interface';
import type { ICacheService } from './interfaces/cache.service.interface';

export class CacheService implements ICacheService {
  constructor(
    private readonly client: Redis,
    private readonly logger: ILogger,
  ) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      if (!raw) {
        return null;
      }

      return JSON.parse(raw) as T;
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
