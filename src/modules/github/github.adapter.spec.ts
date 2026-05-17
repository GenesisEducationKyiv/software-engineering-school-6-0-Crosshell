import { describe, it, expect, beforeEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { GithubAdapter } from './github.adapter';
import type { IGithubHttpClient } from './interfaces/github-http-client.interface';
import type { GitHubRelease, GitHubRepository } from './github.schemas';
import { NotFoundError, RateLimitError } from '@/shared/errors/app.errors';

const OWNER = 'acc';
const REPO = 'testName';

const GITHUB_REPO: GitHubRepository = {
  id: 1,
  fullName: `${OWNER}/${REPO}`,
  htmlUrl: `https://github.com/${OWNER}/${REPO}`,
};

const GITHUB_RELEASE: GitHubRelease = {
  tagName: 'v2.0.0',
  htmlUrl: `https://github.com/${OWNER}/${REPO}/releases/tag/v2.0.0`,
};

describe('GithubAdapter', () => {
  let httpClient: ReturnType<typeof mock<IGithubHttpClient>>;
  let adapter: GithubAdapter;

  beforeEach(() => {
    httpClient = mock<IGithubHttpClient>();
    adapter = new GithubAdapter(httpClient);
  });

  describe('getRepository', () => {
    it('should delegate to httpClient with the correct owner and repo', async () => {
      httpClient.fetchRepository.mockResolvedValue(GITHUB_REPO);

      await adapter.getRepository(OWNER, REPO);

      expect(httpClient.fetchRepository).toHaveBeenCalledWith(OWNER, REPO);
    });

    it('should map fullName to separate owner and repo fields', async () => {
      httpClient.fetchRepository.mockResolvedValue(GITHUB_REPO);

      const result = await adapter.getRepository(OWNER, REPO);

      expect(result).toEqual({ owner: OWNER, repo: REPO });
    });

    it('should use the canonical casing returned by the HTTP client', async () => {
      httpClient.fetchRepository.mockResolvedValue({
        ...GITHUB_REPO,
        fullName: 'Acc/TestName',
      });

      const result = await adapter.getRepository('ACC', 'TESTNAME');

      expect(result).toEqual({ owner: 'Acc', repo: 'TestName' });
    });

    it('should propagate errors from the HTTP client', async () => {
      httpClient.fetchRepository.mockRejectedValue(
        new NotFoundError('not found'),
      );

      await expect(adapter.getRepository(OWNER, REPO)).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe('getLatestRelease', () => {
    it('should delegate to httpClient with the correct owner and repo', async () => {
      httpClient.fetchLatestRelease.mockResolvedValue(GITHUB_RELEASE);

      await adapter.getLatestRelease(OWNER, REPO);

      expect(httpClient.fetchLatestRelease).toHaveBeenCalledWith(OWNER, REPO);
    });

    it('should map htmlUrl to releaseUrl', async () => {
      httpClient.fetchLatestRelease.mockResolvedValue(GITHUB_RELEASE);

      const result = await adapter.getLatestRelease(OWNER, REPO);

      expect(result).toEqual({
        tagName: GITHUB_RELEASE.tagName,
        releaseUrl: GITHUB_RELEASE.htmlUrl,
      });
    });

    it('should return null when the HTTP client returns null', async () => {
      httpClient.fetchLatestRelease.mockResolvedValue(null);

      const result = await adapter.getLatestRelease(OWNER, REPO);

      expect(result).toBeNull();
    });

    it('should propagate errors from the HTTP client', async () => {
      httpClient.fetchLatestRelease.mockRejectedValue(
        new RateLimitError('rate limited'),
      );

      await expect(adapter.getLatestRelease(OWNER, REPO)).rejects.toThrow(
        RateLimitError,
      );
    });
  });
});
