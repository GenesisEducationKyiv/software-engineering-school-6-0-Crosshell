export interface ICacheService {
  get<T>(key: string): Promise<T | null>;
  setWithExpiry(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}
