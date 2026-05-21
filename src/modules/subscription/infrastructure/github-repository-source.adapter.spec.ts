import { describe, it, expect, beforeEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { GithubRepositorySourceAdapter } from './github-repository-source.adapter';
import type { IGithubHttpClient } from '@/modules/github/interfaces/github-http-client.interface';
import type { GitHubRepository } from '@/modules/github/github.schemas';
import { NotFoundError } from '@/shared/errors/app.errors';

const OWNER = 'acc';
const REPO = 'testName';

const GITHUB_REPO: GitHubRepository = {
  id: 1,
  owner: OWNER,
  repo: REPO,
  htmlUrl: `https://github.com/${OWNER}/${REPO}`,
};

describe('GithubRepositorySourceAdapter', () => {
  let httpClient: ReturnType<typeof mock<IGithubHttpClient>>;
  let adapter: GithubRepositorySourceAdapter;

  beforeEach(() => {
    httpClient = mock<IGithubHttpClient>();
    adapter = new GithubRepositorySourceAdapter(httpClient);
  });

  it('should delegate to httpClient with the correct owner and repo', async () => {
    httpClient.fetchRepository.mockResolvedValue(GITHUB_REPO);

    await adapter.getRepository(OWNER, REPO);

    expect(httpClient.fetchRepository).toHaveBeenCalledWith(OWNER, REPO);
  });

  it('should map owner and repo from the HTTP client response', async () => {
    httpClient.fetchRepository.mockResolvedValue(GITHUB_REPO);

    const result = await adapter.getRepository(OWNER, REPO);

    expect(result).toEqual({ owner: OWNER, repo: REPO });
  });

  it('should use the canonical casing returned by the HTTP client', async () => {
    httpClient.fetchRepository.mockResolvedValue({
      ...GITHUB_REPO,
      owner: 'Acc',
      repo: 'TestName',
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
