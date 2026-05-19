import type { IGithubHttpClient } from '../interfaces/github-http-client.interface';
import type { ICacheService } from '@/infrastructure/cache/interfaces/cache.service.interface';
import type { GitHubRelease, GitHubRepository } from '../github.schemas';
import { gitHubRepositorySchema } from '../github.schemas';
import { githubConfig } from '@/shared/config';
import { githubApiRequestsTotal } from '@/infrastructure/metrics/metrics.registry';

export class CachingGithubHttpClientDecorator implements IGithubHttpClient {
  constructor(
    private readonly inner: IGithubHttpClient,
    private readonly cache: ICacheService,
  ) {}

  async fetchRepository(
    owner: string,
    repo: string,
  ): Promise<GitHubRepository> {
    const key = `github:repo:${owner}:${repo}`;

    const cached = await this.cache.get(key, gitHubRepositorySchema);
    if (cached) {
      githubApiRequestsTotal.inc({ operation: 'getRepository', cache: 'hit' });

      return cached;
    }

    const result = await this.inner.fetchRepository(owner, repo);
    githubApiRequestsTotal.inc({ operation: 'getRepository', cache: 'miss' });
    await this.cache.setWithExpiry(key, result, githubConfig.cacheTtlSeconds);

    return result;
  }

  async fetchLatestRelease(
    owner: string,
    repo: string,
  ): Promise<GitHubRelease | null> {
    githubApiRequestsTotal.inc({
      operation: 'getLatestRelease',
      cache: 'none',
    });

    return this.inner.fetchLatestRelease(owner, repo);
  }
}
