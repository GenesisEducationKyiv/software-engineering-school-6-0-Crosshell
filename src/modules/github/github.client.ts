import { NotFoundError, RateLimitError } from '@/shared/errors/app.errors';
import { HttpStatus } from '@/shared/constants/http-status.constant';
import type {
  GitHubRepository,
  GitHubRelease,
} from '@/modules/github/github.schemas';
import {
  gitHubRepositorySchema,
  gitHubReleaseSchema,
} from '@/modules/github/github.schemas';
import { githubConfig } from '@/shared/config';
import type { CacheService } from '@/infrastructure/cache/cache.service';
import { githubApiRequestsTotal } from '@/infrastructure/metrics/metrics.registry';

export class GithubClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(private readonly cache: CacheService) {
    this.baseUrl = githubConfig.baseUrl;
    this.headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(githubConfig.token
        ? { Authorization: `Bearer ${githubConfig.token}` }
        : {}),
    };
  }

  async getRepository(owner: string, repo: string): Promise<GitHubRepository> {
    const key = GithubClient.cacheKeyRepo(owner, repo);

    const cached = await this.cache.get(key, gitHubRepositorySchema);
    if (cached) {
      githubApiRequestsTotal.inc({
        operation: 'getRepository',
        cache: 'hit',
      });
      return cached;
    }

    const res = await fetch(`${this.baseUrl}/repos/${owner}/${repo}`, {
      headers: this.headers,
    });

    if (res.status === HttpStatus.NOT_FOUND) {
      throw new NotFoundError(
        `Repository ${owner}/${repo} not found on GitHub`,
      );
    }

    if (this.isRateLimited(res)) {
      const retryAfter = this.parseRetryAfter(res);
      throw new RateLimitError(`Please try again after ${retryAfter} seconds`);
    }

    if (!res.ok)
      throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);

    githubApiRequestsTotal.inc({ operation: 'getRepository', cache: 'miss' });

    const raw = await res.json();
    await this.cache.set(key, raw, githubConfig.cacheTtlSeconds);
    return gitHubRepositorySchema.parse(raw);
  }

  async getLatestRelease(
    owner: string,
    repo: string,
  ): Promise<GitHubRelease | null> {
    const key = GithubClient.cacheKeyRelease(owner, repo);

    const cached = await this.cache.get(key, gitHubReleaseSchema);
    if (cached) {
      githubApiRequestsTotal.inc({
        operation: 'getLatestRelease',
        cache: 'hit',
      });
      return cached;
    }

    const res = await fetch(
      `${this.baseUrl}/repos/${owner}/${repo}/releases/latest`,
      { headers: this.headers },
    );

    if (res.status === HttpStatus.NOT_FOUND) return null;

    if (this.isRateLimited(res)) {
      const retryAfter = this.parseRetryAfter(res);
      throw new RateLimitError(`Please try again after ${retryAfter} seconds`);
    }

    if (!res.ok)
      throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);

    githubApiRequestsTotal.inc({
      operation: 'getLatestRelease',
      cache: 'miss',
    });

    const raw = await res.json();
    await this.cache.set(key, raw, githubConfig.cacheTtlSeconds);
    return gitHubReleaseSchema.parse(raw);
  }

  private static cacheKeyRepo(owner: string, repo: string): string {
    return `github:repo:${owner}:${repo}`;
  }

  private static cacheKeyRelease(owner: string, repo: string): string {
    return `github:release:${owner}:${repo}`;
  }

  private isRateLimited(res: Response): boolean {
    if (res.status === HttpStatus.TOO_MANY_REQUESTS) return true;
    if (res.status === HttpStatus.FORBIDDEN) {
      return (
        res.headers.get('x-ratelimit-remaining') === '0' ||
        res.headers.get('retry-after') !== null
      );
    }
    return false;
  }

  private parseRetryAfter(res: Response): number | null {
    const value = res.headers.get('Retry-After');
    if (!value) return null;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? null : parsed;
  }
}
