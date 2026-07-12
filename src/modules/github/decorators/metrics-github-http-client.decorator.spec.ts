import { describe, it, expect, beforeEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { MetricsGithubHttpClientDecorator } from './metrics-github-http-client.decorator';
import type { IGithubHttpClient } from '../interfaces/github-http-client.interface';
import type { IGithubApiMetrics } from '../interfaces/github-metrics.interface';
import type { GitHubRelease, GitHubRepository } from '../github.schemas';

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

describe('MetricsGithubHttpClientDecorator', () => {
  let inner: ReturnType<typeof mock<IGithubHttpClient>>;
  let metrics: ReturnType<typeof mock<IGithubApiMetrics>>;
  let decorator: MetricsGithubHttpClientDecorator;

  beforeEach(() => {
    inner = mock<IGithubHttpClient>();
    metrics = mock<IGithubApiMetrics>();

    inner.fetchRepository.mockResolvedValue(GITHUB_REPO);
    inner.fetchLatestRelease.mockResolvedValue(GITHUB_RELEASE);

    decorator = new MetricsGithubHttpClientDecorator(inner, metrics);
  });

  describe('fetchRepository', () => {
    it('should delegate to the inner client', async () => {
      await decorator.fetchRepository(OWNER, REPO);

      expect(inner.fetchRepository).toHaveBeenCalledWith(OWNER, REPO);
    });

    it('should return the result from the inner client', async () => {
      const result = await decorator.fetchRepository(OWNER, REPO);

      expect(result).toEqual(GITHUB_REPO);
    });

    it('should increment the API request counter', async () => {
      await decorator.fetchRepository(OWNER, REPO);

      expect(metrics.incApiRequest).toHaveBeenCalledWith('fetchRepository');
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

    it('should increment the API request counter', async () => {
      await decorator.fetchLatestRelease(OWNER, REPO);

      expect(metrics.incApiRequest).toHaveBeenCalledWith('fetchLatestRelease');
    });
  });
});
