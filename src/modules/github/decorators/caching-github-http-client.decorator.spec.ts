import { describe, it, expect, beforeEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { CachingGithubHttpClientDecorator } from './caching-github-http-client.decorator';
import type { IGithubHttpClient } from '../interfaces/github-http-client.interface';
import type { ICacheService } from '@/infrastructure/cache/interfaces/cache.service.interface';
import type { GitHubRelease, GitHubRepository } from '../github.schemas';
import type { IGithubCacheMetrics } from '../interfaces/github-metrics.interface';

const CACHE_TTL_SECONDS = 600;

const OWNER = 'acc';
const REPO = 'testName';

const GITHUB_REPO: GitHubRepository = {
  id: 1,
  owner: OWNER,
  repo: REPO,
  htmlUrl: `https://github.com/${OWNER}/${REPO}`,
};

const GITHUB_RELEASE: GitHubRelease = {
  tagName: 'v1.0.0',
  htmlUrl: 'https://github.com/owner/repo/releases/tag/v1.0.0',
};

const CACHE_KEY = `github:repo:${OWNER}:${REPO}`;

describe('CachingGithubHttpClientDecorator', () => {
  let inner: ReturnType<typeof mock<IGithubHttpClient>>;
  let cache: ReturnType<typeof mock<ICacheService>>;
  let metrics: ReturnType<typeof mock<IGithubCacheMetrics>>;
  let decorator: CachingGithubHttpClientDecorator;

  beforeEach(() => {
    inner = mock<IGithubHttpClient>();
    cache = mock<ICacheService>();
    metrics = mock<IGithubCacheMetrics>();

    cache.get.mockResolvedValue(null);
    cache.setWithExpiry.mockResolvedValue(undefined);
    inner.fetchRepository.mockResolvedValue(GITHUB_REPO);
    inner.fetchLatestRelease.mockResolvedValue(GITHUB_RELEASE);

    decorator = new CachingGithubHttpClientDecorator(inner, cache, metrics, {
      cacheTtlSeconds: CACHE_TTL_SECONDS,
    });
  });

  describe('fetchRepository', () => {
    describe('cache hit', () => {
      beforeEach(() => {
        cache.get.mockResolvedValue(GITHUB_REPO);
      });

      it('should return the cached value without calling the inner client', async () => {
        const result = await decorator.fetchRepository(OWNER, REPO);

        expect(result).toEqual(GITHUB_REPO);
        expect(inner.fetchRepository).not.toHaveBeenCalled();
      });

      it('should look up the cache with the correct key', async () => {
        await decorator.fetchRepository(OWNER, REPO);

        expect(cache.get).toHaveBeenCalledWith(CACHE_KEY, expect.anything());
      });

      it('should increment the cache-hit counter', async () => {
        await decorator.fetchRepository(OWNER, REPO);

        expect(metrics.incCacheHit).toHaveBeenCalledWith('fetchRepository');
      });
    });

    describe('cache miss', () => {
      it('should delegate to the inner client', async () => {
        await decorator.fetchRepository(OWNER, REPO);

        expect(inner.fetchRepository).toHaveBeenCalledWith(OWNER, REPO);
      });

      it('should return the result from the inner client', async () => {
        const result = await decorator.fetchRepository(OWNER, REPO);

        expect(result).toEqual(GITHUB_REPO);
      });

      it('should store the result in the cache with the correct key and TTL', async () => {
        await decorator.fetchRepository(OWNER, REPO);

        expect(cache.setWithExpiry).toHaveBeenCalledWith(
          CACHE_KEY,
          GITHUB_REPO,
          600,
        );
      });

      it('should increment the cache-miss counter', async () => {
        await decorator.fetchRepository(OWNER, REPO);

        expect(metrics.incCacheMiss).toHaveBeenCalledWith('fetchRepository');
      });

      it('should not write to the cache when the inner client throws', async () => {
        inner.fetchRepository.mockRejectedValue(new Error('not found'));

        await expect(decorator.fetchRepository(OWNER, REPO)).rejects.toThrow();
        expect(cache.setWithExpiry).not.toHaveBeenCalled();
      });
    });
  });

  describe('fetchLatestRelease', () => {
    it('should delegate to the inner client', async () => {
      await decorator.fetchLatestRelease(OWNER, REPO);

      expect(inner.fetchLatestRelease).toHaveBeenCalledWith(OWNER, REPO);
    });

    it('should return the result from the inner client', async () => {
      const result = await decorator.fetchLatestRelease(OWNER, REPO);

      expect(result).toEqual(GITHUB_RELEASE);
    });
  });
});
