import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { http, HttpResponse } from 'msw';
import { GithubClient } from './github.client';
import type { CacheService } from '@/infrastructure/cache/cache.service';
import { NotFoundError, RateLimitError } from '@/shared/errors/app.errors';
import type { GitHubRelease, GitHubRepository } from './github.schemas';

vi.mock('@/shared/config', () => ({
  githubConfig: {
    baseUrl: 'https://api.github.com',
    token: undefined,
    cacheTtlSeconds: 600,
  },
}));

vi.mock('@/infrastructure/metrics/metrics.registry', () => ({
  githubApiRequestsTotal: { inc: vi.fn() },
}));

import { githubApiRequestsTotal } from '@/infrastructure/metrics/metrics.registry';
import { server } from '../../../tests/mocks/server';

const OWNER = 'acc';
const REPO = 'testName';

const RAW_REPO = {
  id: 1,
  full_name: `${OWNER}/${REPO}`,
  html_url: `https://github.com/${OWNER}/${REPO}`,
};

const PARSED_REPO: GitHubRepository = {
  id: 1,
  fullName: `${OWNER}/${REPO}`,
  htmlUrl: `https://github.com/${OWNER}/${REPO}`,
};

const RAW_RELEASE = {
  tag_name: 'v1.0.0',
  html_url: 'https://github.com/owner/repo/releases/tag/v1.0.0',
};

const PARSED_RELEASE: GitHubRelease = {
  tagName: 'v1.0.0',
  htmlUrl: 'https://github.com/owner/repo/releases/tag/v1.0.0',
};

describe('GithubClient', () => {
  let cache: ReturnType<typeof mock<CacheService>>;
  let client: GithubClient;

  beforeEach(() => {
    cache = mock<CacheService>();
    cache.get.mockResolvedValue(null);
    cache.set.mockResolvedValue(undefined);

    client = new GithubClient(cache);
  });

  describe('getRepository', () => {
    describe('cache hit', () => {
      it('should return the cached value without making an HTTP request', async () => {
        cache.get.mockResolvedValue(PARSED_REPO);

        const result = await client.getRepository(OWNER, REPO);

        expect(result).toEqual(PARSED_REPO);
      });

      it('should increment the cache-hit counter', async () => {
        cache.get.mockResolvedValue(PARSED_REPO);

        await client.getRepository(OWNER, REPO);

        expect(githubApiRequestsTotal.inc).toHaveBeenCalledWith({
          operation: 'getRepository',
          cache: 'hit',
        });
      });

      it('should look up the cache with the correct key', async () => {
        cache.get.mockResolvedValue(PARSED_REPO);

        await client.getRepository(OWNER, REPO);

        expect(cache.get).toHaveBeenCalledWith(
          `github:repo:${OWNER}:${REPO}`,
          expect.anything(),
        );
      });
    });

    describe('cache miss successful fetch', () => {
      it('should return the parsed repository data', async () => {
        const result = await client.getRepository(OWNER, REPO);

        expect(result).toEqual(PARSED_REPO);
      });

      it('should store the raw response in the cache with the correct TTL', async () => {
        await client.getRepository(OWNER, REPO);

        expect(cache.set).toHaveBeenCalledWith(
          `github:repo:${OWNER}:${REPO}`,
          RAW_REPO,
          600,
        );
      });

      it('should increment the cache-miss counter', async () => {
        await client.getRepository(OWNER, REPO);

        expect(githubApiRequestsTotal.inc).toHaveBeenCalledWith({
          operation: 'getRepository',
          cache: 'miss',
        });
      });
    });

    describe('404 repository not found', () => {
      beforeEach(() => {
        server.use(
          http.get(
            'https://api.github.com/repos/:owner/:repo',
            () => new HttpResponse(null, { status: 404 }),
          ),
        );
      });

      it('should throw NotFoundError', async () => {
        await expect(client.getRepository(OWNER, REPO)).rejects.toThrow(
          NotFoundError,
        );
      });

      it('should include the owner/repo in the error message', async () => {
        await expect(client.getRepository(OWNER, REPO)).rejects.toThrow(
          `${OWNER}/${REPO}`,
        );
      });

      it('should not cache anything', async () => {
        await expect(client.getRepository(OWNER, REPO)).rejects.toThrow();
        expect(cache.set).not.toHaveBeenCalled();
      });
    });

    describe('429 rate limited', () => {
      beforeEach(() => {
        server.use(
          http.get(
            'https://api.github.com/repos/:owner/:repo',
            () =>
              new HttpResponse(null, {
                status: 429,
                headers: { 'Retry-After': '60' },
              }),
          ),
        );
      });

      it('should throw RateLimitError', async () => {
        await expect(client.getRepository(OWNER, REPO)).rejects.toThrow(
          RateLimitError,
        );
      });

      it('should include the retry-after seconds in the error message', async () => {
        await expect(client.getRepository(OWNER, REPO)).rejects.toThrow('60');
      });
    });

    describe('403 rate limited via x-ratelimit-remaining header', () => {
      beforeEach(() => {
        server.use(
          http.get(
            'https://api.github.com/repos/:owner/:repo',
            () =>
              new HttpResponse(null, {
                status: 403,
                headers: { 'x-ratelimit-remaining': '0' },
              }),
          ),
        );
      });

      it('should throw RateLimitError', async () => {
        await expect(client.getRepository(OWNER, REPO)).rejects.toThrow(
          RateLimitError,
        );
      });
    });

    describe('403 rate limited via retry-after header', () => {
      beforeEach(() => {
        server.use(
          http.get(
            'https://api.github.com/repos/:owner/:repo',
            () =>
              new HttpResponse(null, {
                status: 403,
                headers: { 'retry-after': '120', 'Retry-After': '120' },
              }),
          ),
        );
      });

      it('should throw RateLimitError', async () => {
        await expect(client.getRepository(OWNER, REPO)).rejects.toThrow(
          RateLimitError,
        );
      });

      it('should include the retry-after seconds in the error message', async () => {
        await expect(client.getRepository(OWNER, REPO)).rejects.toThrow('120');
      });
    });

    describe('unexpected non-ok response', () => {
      beforeEach(() => {
        server.use(
          http.get(
            'https://api.github.com/repos/:owner/:repo',
            () =>
              new HttpResponse(null, {
                status: 500,
                statusText: 'Internal Server Error',
              }),
          ),
        );
      });

      it('should throw a generic Error', async () => {
        await expect(client.getRepository(OWNER, REPO)).rejects.toThrow(
          'GitHub API error: 500',
        );
      });

      it('should not throw a NotFoundError or RateLimitError', async () => {
        await expect(client.getRepository(OWNER, REPO)).rejects.not.toThrow(
          NotFoundError,
        );
      });
    });
  });

  describe('getLatestRelease', () => {
    describe('cache hit', () => {
      it('should return the cached release without making an HTTP request', async () => {
        cache.get.mockResolvedValue(PARSED_RELEASE);

        const result = await client.getLatestRelease(OWNER, REPO);

        expect(result).toEqual(PARSED_RELEASE);
      });

      it('should increment the cache-hit counter', async () => {
        cache.get.mockResolvedValue(PARSED_RELEASE);

        await client.getLatestRelease(OWNER, REPO);

        expect(githubApiRequestsTotal.inc).toHaveBeenCalledWith({
          operation: 'getLatestRelease',
          cache: 'hit',
        });
      });

      it('should look up the cache with the correct key', async () => {
        cache.get.mockResolvedValue(PARSED_RELEASE);

        await client.getLatestRelease(OWNER, REPO);

        expect(cache.get).toHaveBeenCalledWith(
          `github:release:${OWNER}:${REPO}`,
          expect.anything(),
        );
      });
    });

    describe('cache miss successful fetch', () => {
      it('should return the parsed release data', async () => {
        const result = await client.getLatestRelease(OWNER, REPO);

        expect(result).toEqual(PARSED_RELEASE);
      });

      it('should store the raw response in the cache with the correct TTL', async () => {
        await client.getLatestRelease(OWNER, REPO);

        expect(cache.set).toHaveBeenCalledWith(
          `github:release:${OWNER}:${REPO}`,
          RAW_RELEASE,
          600,
        );
      });

      it('should increment the cache-miss counter', async () => {
        await client.getLatestRelease(OWNER, REPO);

        expect(githubApiRequestsTotal.inc).toHaveBeenCalledWith({
          operation: 'getLatestRelease',
          cache: 'miss',
        });
      });
    });

    describe('404 no release published yet', () => {
      beforeEach(() => {
        server.use(
          http.get(
            'https://api.github.com/repos/:owner/:repo/releases/latest',
            () => new HttpResponse(null, { status: 404 }),
          ),
        );
      });

      it('should return null instead of throwing', async () => {
        const result = await client.getLatestRelease(OWNER, REPO);

        expect(result).toBeNull();
      });

      it('should not cache anything on 404', async () => {
        await client.getLatestRelease(OWNER, REPO);

        expect(cache.set).not.toHaveBeenCalled();
      });
    });

    describe('429 rate limited', () => {
      beforeEach(() => {
        server.use(
          http.get(
            'https://api.github.com/repos/:owner/:repo/releases/latest',
            () =>
              new HttpResponse(null, {
                status: 429,
                headers: { 'Retry-After': '30' },
              }),
          ),
        );
      });

      it('should throw RateLimitError', async () => {
        await expect(client.getLatestRelease(OWNER, REPO)).rejects.toThrow(
          RateLimitError,
        );
      });

      it('should include the retry-after seconds in the error message', async () => {
        await expect(client.getLatestRelease(OWNER, REPO)).rejects.toThrow(
          '30',
        );
      });
    });

    describe('unexpected non-ok response', () => {
      beforeEach(() => {
        server.use(
          http.get(
            'https://api.github.com/repos/:owner/:repo/releases/latest',
            () =>
              new HttpResponse(null, {
                status: 503,
                statusText: 'Service Unavailable',
              }),
          ),
        );
      });

      it('should throw a generic Error', async () => {
        await expect(client.getLatestRelease(OWNER, REPO)).rejects.toThrow(
          'GitHub API error: 503',
        );
      });
    });
  });
});
