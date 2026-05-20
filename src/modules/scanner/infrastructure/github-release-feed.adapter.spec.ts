import { describe, it, expect, beforeEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { GithubReleaseFeedAdapter } from './github-release-feed.adapter';
import type { IGithubHttpClient } from '@/modules/github/interfaces/github-http-client.interface';
import type { GitHubRelease } from '@/modules/github/github.schemas';
import { RateLimitError } from '@/shared/errors/app.errors';

const OWNER = 'acc';
const REPO = 'testName';

const GITHUB_RELEASE: GitHubRelease = {
  tagName: 'v2.0.0',
  htmlUrl: `https://github.com/${OWNER}/${REPO}/releases/tag/v2.0.0`,
};

describe('GithubReleaseFeedAdapter', () => {
  let httpClient: ReturnType<typeof mock<IGithubHttpClient>>;
  let adapter: GithubReleaseFeedAdapter;

  beforeEach(() => {
    httpClient = mock<IGithubHttpClient>();
    adapter = new GithubReleaseFeedAdapter(httpClient);
  });

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
