import { NotFoundError, RateLimitError } from '@/shared/errors/app.errors';
import { HttpStatus } from '@/shared/constants/http-status.constant';
import type { GitHubRelease, GitHubRepository } from './github.schemas';
import { gitHubRepositorySchema, gitHubReleaseSchema } from './github.schemas';
import { githubConfig } from '@/shared/config';
import type { IGithubHttpClient } from './interfaces/github-http-client.interface';

export class GithubHttpClient implements IGithubHttpClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor() {
    this.baseUrl = githubConfig.baseUrl;
    this.headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(githubConfig.token
        ? { Authorization: `Bearer ${githubConfig.token}` }
        : {}),
    };
  }

  async fetchRepository(
    owner: string,
    repo: string,
  ): Promise<GitHubRepository> {
    const res = await fetch(`${this.baseUrl}/repos/${owner}/${repo}`, {
      headers: this.headers,
    });

    if (res.status === HttpStatus.NOT_FOUND) {
      throw new NotFoundError(
        `Repository ${owner}/${repo} not found on GitHub`,
      );
    }

    this.throwIfRateLimited(res);

    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
    }

    const raw: unknown = await res.json();

    return gitHubRepositorySchema.parse(raw);
  }

  async fetchLatestRelease(
    owner: string,
    repo: string,
  ): Promise<GitHubRelease | null> {
    const res = await fetch(
      `${this.baseUrl}/repos/${owner}/${repo}/releases/latest`,
      { headers: this.headers },
    );

    if (res.status === HttpStatus.NOT_FOUND) {
      return null;
    }

    this.throwIfRateLimited(res);

    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
    }

    const raw: unknown = await res.json();

    return gitHubReleaseSchema.parse(raw);
  }

  private throwIfRateLimited(res: Response): void {
    if (!this.isRateLimited(res)) {
      return;
    }

    const retryAfter = this.parseRetryAfter(res);
    throw new RateLimitError(`Please try again after ${retryAfter} seconds`);
  }

  private isRateLimited(res: Response): boolean {
    if (res.status === HttpStatus.TOO_MANY_REQUESTS) {
      return true;
    }

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
    if (!value) {
      return null;
    }
    const parsed = parseInt(value, 10);

    return isNaN(parsed) ? null : parsed;
  }
}
