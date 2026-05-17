import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { z } from 'zod';
import type { Redis } from 'ioredis';
import { CacheService } from './cache.service';

vi.mock('@/shared/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { logger } from '@/shared/logger';

const schema = z.object({ id: z.number(), name: z.string() });
type Payload = z.infer<typeof schema>;

const VALID_PAYLOAD: Payload = { id: 1, name: 'test' };
const CACHE_KEY = 'test:key';
const TTL = 300;

describe('CacheService', () => {
  let client: ReturnType<typeof mock<Redis>>;
  let service: CacheService;

  beforeEach(() => {
    client = mock<Redis>();
    service = new CacheService(client);
  });

  describe('get', () => {
    describe('cache miss', () => {
      it('should return null when the key does not exist in Redis', async () => {
        client.get.mockResolvedValue(null);

        const result = await service.get(CACHE_KEY, schema);

        expect(result).toBeNull();
      });

      it('should not log any warning on a clean cache miss', async () => {
        client.get.mockResolvedValue(null);

        await service.get(CACHE_KEY, schema);

        expect(logger.warn).not.toHaveBeenCalled();
      });
    });

    describe('cache hit with valid data', () => {
      it('should return the deserialized and schema-validated value', async () => {
        client.get.mockResolvedValue(JSON.stringify(VALID_PAYLOAD));

        const result = await service.get(CACHE_KEY, schema);

        expect(result).toEqual(VALID_PAYLOAD);
      });

      it('should not log any warning for a valid cache hit', async () => {
        client.get.mockResolvedValue(JSON.stringify(VALID_PAYLOAD));

        await service.get(CACHE_KEY, schema);

        expect(logger.warn).not.toHaveBeenCalled();
      });
    });

    describe('cache hit with schema-invalid (stale) data', () => {
      it('should return null when cached JSON does not satisfy the schema', async () => {
        client.get.mockResolvedValue(JSON.stringify({ id: 1, name: 42 }));

        const result = await service.get(CACHE_KEY, schema);

        expect(result).toBeNull();
      });

      it('should log a warning with the key and issues when data is stale', async () => {
        client.get.mockResolvedValue(JSON.stringify({ id: 'not-a-number' }));

        await service.get(CACHE_KEY, schema);

        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            key: CACHE_KEY,
            issues: expect.any(Array),
          }),
          '[Cache] Stale or invalid data, cache miss',
        );
      });
    });

    describe('cache hit with malformed JSON', () => {
      it('should return null when the cached value is not valid JSON', async () => {
        client.get.mockResolvedValue('not-json{{{');

        const result = await service.get(CACHE_KEY, schema);

        expect(result).toBeNull();
      });

      it('should log a warning with the key when JSON parsing fails', async () => {
        client.get.mockResolvedValue('{broken');

        await service.get(CACHE_KEY, schema);

        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({ key: CACHE_KEY }),
          '[Cache] Get failed',
        );
      });
    });

    describe('when Redis throws', () => {
      it('should return null and not rethrow the error', async () => {
        client.get.mockRejectedValue(new Error('Redis connection lost'));

        const result = await service.get(CACHE_KEY, schema);

        expect(result).toBeNull();
      });

      it('should log a warning with the key and error when Redis throws', async () => {
        const redisError = new Error('Redis connection lost');
        client.get.mockRejectedValue(redisError);

        await service.get(CACHE_KEY, schema);

        expect(logger.warn).toHaveBeenCalledWith(
          { err: redisError, key: CACHE_KEY },
          '[Cache] Get failed',
        );
      });
    });
  });

  describe('setWithExpiry', () => {
    it('should serialize the value and store it with the correct TTL', async () => {
      await service.setWithExpiry(CACHE_KEY, VALID_PAYLOAD, TTL);

      expect(client.set).toHaveBeenCalledWith(
        CACHE_KEY,
        JSON.stringify(VALID_PAYLOAD),
        'EX',
        TTL,
      );
    });

    it('should resolve without throwing when Redis throws', async () => {
      client.set.mockRejectedValue(new Error('Redis write error'));

      await expect(
        service.setWithExpiry(CACHE_KEY, VALID_PAYLOAD, TTL),
      ).resolves.toBeUndefined();
    });

    it('should log a warning with the key and error when Redis throws', async () => {
      const redisError = new Error('Redis write error');
      client.set.mockRejectedValue(redisError);

      await service.setWithExpiry(CACHE_KEY, VALID_PAYLOAD, TTL);

      expect(logger.warn).toHaveBeenCalledWith(
        { err: redisError, key: CACHE_KEY },
        '[Cache] Set failed',
      );
    });
  });

  describe('quit', () => {
    it('should delegate to the Redis client quit method', async () => {
      await service.quit();

      expect(client.quit).toHaveBeenCalledOnce();
    });
  });
});
