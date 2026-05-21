import type { IGithubHttpClient } from '../interfaces/github-http-client.interface';
import type { ICacheService } from '@/infrastructure/cache/interfaces/cache.service.interface';
import type { GitHubRelease, GitHubRepository } from '../github.schemas';
import { gitHubRepositorySchema } from '../github.schemas';
import { githubConfig } from '@/shared/config';
import type { IGithubMetrics } from '../interfaces/github-metrics.interface';

export class CachingGithubHttpClientDecorator implements IGithubHttpClient {
  constructor(
    private readonly inner: IGithubHttpClient,
    private readonly cache: ICacheService,
    private readonly metrics: IGithubMetrics,
  ) {}

  async fetchRepository(
    owner: string,
    repo: string,
  ): Promise<GitHubRepository> {
    const key = `github:repo:${owner}:${repo}`;

    const cached = await this.cache.get(key, gitHubRepositorySchema);
    if (cached) {
      this.metrics.incApiRequest('getRepository', 'hit');

      return cached;
    }

    const result = await this.inner.fetchRepository(owner, repo);
    this.metrics.incApiRequest('getRepository', 'miss');
    await this.cache.setWithExpiry(key, result, githubConfig.cacheTtlSeconds);

    return result;
  }

  async fetchLatestRelease(
    owner: string,
    repo: string,
  ): Promise<GitHubRelease | null> {
    this.metrics.incApiRequest('getLatestRelease', 'none');

    return this.inner.fetchLatestRelease(owner, repo);
  }
}
