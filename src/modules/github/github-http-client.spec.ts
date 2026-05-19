import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { GithubHttpClient } from './github-http-client';
import { NotFoundError, RateLimitError } from '@/shared/errors/app.errors';
import type { GitHubRelease, GitHubRepository } from './github.schemas';
import { server } from '../../../tests/mocks/server';

vi.mock('@/shared/config', () => ({
  githubConfig: {
    baseUrl: 'https://api.github.com',
    token: undefined,
    cacheTtlSeconds: 600,
  },
}));

const OWNER = 'acc';
const REPO = 'testName';

const GITHUB_REPO: GitHubRepository = {
  id: 1,
  fullName: `${OWNER}/${REPO}`,
  htmlUrl: `https://github.com/${OWNER}/${REPO}`,
};

const GITHUB_RELEASE: GitHubRelease = {
  tagName: 'v1.0.0',
  htmlUrl: 'https://github.com/owner/repo/releases/tag/v1.0.0',
};

describe('GithubHttpClient', () => {
  let client: GithubHttpClient;

  beforeEach(() => {
    client = new GithubHttpClient();
  });

  describe('fetchRepository', () => {
    describe('successful fetch', () => {
      it('should return the parsed repository data', async () => {
        const result = await client.fetchRepository(OWNER, REPO);

        expect(result).toEqual(GITHUB_REPO);
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
        await expect(client.fetchRepository(OWNER, REPO)).rejects.toThrow(
          NotFoundError,
        );
      });

      it('should include the owner/repo in the error message', async () => {
        await expect(client.fetchRepository(OWNER, REPO)).rejects.toThrow(
          `${OWNER}/${REPO}`,
        );
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
        await expect(client.fetchRepository(OWNER, REPO)).rejects.toThrow(
          RateLimitError,
        );
      });

      it('should include the retry-after seconds in the error message', async () => {
        await expect(client.fetchRepository(OWNER, REPO)).rejects.toThrow('60');
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
        await expect(client.fetchRepository(OWNER, REPO)).rejects.toThrow(
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
        await expect(client.fetchRepository(OWNER, REPO)).rejects.toThrow(
          RateLimitError,
        );
      });

      it('should include the retry-after seconds in the error message', async () => {
        await expect(client.fetchRepository(OWNER, REPO)).rejects.toThrow(
          '120',
        );
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
        await expect(client.fetchRepository(OWNER, REPO)).rejects.toThrow(
          'GitHub API error: 500',
        );
      });

      it('should not throw a NotFoundError or RateLimitError', async () => {
        await expect(client.fetchRepository(OWNER, REPO)).rejects.not.toThrow(
          NotFoundError,
        );
        await expect(client.fetchRepository(OWNER, REPO)).rejects.not.toThrow(
          RateLimitError,
        );
      });
    });
  });

  describe('fetchLatestRelease', () => {
    describe('successful fetch', () => {
      it('should return the parsed release data', async () => {
        const result = await client.fetchLatestRelease(OWNER, REPO);

        expect(result).toEqual(GITHUB_RELEASE);
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
        const result = await client.fetchLatestRelease(OWNER, REPO);

        expect(result).toBeNull();
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
        await expect(client.fetchLatestRelease(OWNER, REPO)).rejects.toThrow(
          RateLimitError,
        );
      });

      it('should include the retry-after seconds in the error message', async () => {
        await expect(client.fetchLatestRelease(OWNER, REPO)).rejects.toThrow(
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
        await expect(client.fetchLatestRelease(OWNER, REPO)).rejects.toThrow(
          'GitHub API error: 503',
        );
      });
    });
  });
});
