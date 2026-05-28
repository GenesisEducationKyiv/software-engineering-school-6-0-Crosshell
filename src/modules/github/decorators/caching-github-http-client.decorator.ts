import type { IGithubHttpClient } from '../interfaces/github-http-client.interface';
import type { ICacheService } from '@/infrastructure/cache/interfaces/cache.service.interface';
import type { GitHubRelease, GitHubRepository } from '../github.schemas';
import type { IGithubCacheMetrics } from '../interfaces/github-metrics.interface';

export interface CachingGithubHttpClientConfig {
  cacheTtlSeconds: number;
}

export class CachingGithubHttpClientDecorator implements IGithubHttpClient {
  constructor(
    private readonly inner: IGithubHttpClient,
    private readonly cache: ICacheService,
    private readonly metrics: IGithubCacheMetrics,
    private readonly config: CachingGithubHttpClientConfig,
  ) {}

  async fetchRepository(
    owner: string,
    repo: string,
  ): Promise<GitHubRepository> {
    const key = `github:repo:${owner}:${repo}`;

    const cached = await this.cache.get<GitHubRepository>(key);
    if (cached) {
      this.metrics.incCacheHit('fetchRepository');

      return cached;
    }

    const result = await this.inner.fetchRepository(owner, repo);
    this.metrics.incCacheMiss('fetchRepository');
    await this.cache.setWithExpiry(key, result, this.config.cacheTtlSeconds);

    return result;
  }

  async fetchLatestRelease(
    owner: string,
    repo: string,
  ): Promise<GitHubRelease | null> {
    return this.inner.fetchLatestRelease(owner, repo);
  }
}
