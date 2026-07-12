import { describe, it, expect, beforeEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { Redis } from 'ioredis';
import { CacheService } from './cache.service';
import type { ILogger } from '@/shared/logger/logger.interface';

const VALID_PAYLOAD = { id: 1, name: 'test' };
const CACHE_KEY = 'test:key';
const TTL = 300;

describe('CacheService', () => {
  let client: ReturnType<typeof mock<Redis>>;
  let logger: ReturnType<typeof mock<ILogger>>;
  let service: CacheService;

  beforeEach(() => {
    client = mock<Redis>();
    logger = mock<ILogger>();
    service = new CacheService(client, logger);
  });

  describe('get', () => {
    describe('cache miss', () => {
      it('should return null when the key does not exist in Redis', async () => {
        client.get.mockResolvedValue(null);

        const result = await service.get(CACHE_KEY);

        expect(result).toBeNull();
      });

      it('should not log any warning on a clean cache miss', async () => {
        client.get.mockResolvedValue(null);

        await service.get(CACHE_KEY);

        expect(logger.warn).not.toHaveBeenCalled();
      });
    });

    describe('cache hit', () => {
      it('should return the deserialized value', async () => {
        client.get.mockResolvedValue(JSON.stringify(VALID_PAYLOAD));

        const result = await service.get(CACHE_KEY);

        expect(result).toEqual(VALID_PAYLOAD);
      });

      it('should not log any warning for a valid cache hit', async () => {
        client.get.mockResolvedValue(JSON.stringify(VALID_PAYLOAD));

        await service.get(CACHE_KEY);

        expect(logger.warn).not.toHaveBeenCalled();
      });
    });

    describe('cache hit with malformed JSON', () => {
      it('should return null when the cached value is not valid JSON', async () => {
        client.get.mockResolvedValue('not-json{{{');

        const result = await service.get(CACHE_KEY);

        expect(result).toBeNull();
      });

      it('should log a warning with the key when JSON parsing fails', async () => {
        client.get.mockResolvedValue('{broken');

        await service.get(CACHE_KEY);

        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({ key: CACHE_KEY }),
          '[Cache] Get failed',
        );
      });
    });

    describe('when Redis throws', () => {
      it('should return null and not rethrow the error', async () => {
        client.get.mockRejectedValue(new Error('Redis connection lost'));

        const result = await service.get(CACHE_KEY);

        expect(result).toBeNull();
      });

      it('should log a warning with the key and error when Redis throws', async () => {
        const redisError = new Error('Redis connection lost');
        client.get.mockRejectedValue(redisError);

        await service.get(CACHE_KEY);

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
