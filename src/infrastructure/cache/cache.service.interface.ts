import type { ZodType } from 'zod';

export interface ICacheService {
  get<T>(key: string, schema: ZodType<T>): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}
