import { NotFoundError, RateLimitError } from '@/shared/errors/app.errors';
import { HttpStatus } from '@/shared/constants/http-statutes.constants';
import {
  gitHubRepositorySchema,
  gitHubReleaseSchema,
  GitHubRepository,
  GitHubRelease,
} from '@/modules/github/github.schemas';

export class GithubClient {
  private readonly githubBaseUrl = 'https://api.github.com';
  private readonly headers: Record<string, string>;

  constructor(token?: string) {
    this.headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  async getRepository(owner: string, repo: string): Promise<GitHubRepository> {
    const res = await fetch(`${this.githubBaseUrl}/repos/${owner}/${repo}`, {
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

    return gitHubRepositorySchema.parse(await res.json());
  }

  async getLatestRelease(
    owner: string,
    repo: string,
  ): Promise<GitHubRelease | null> {
    const res = await fetch(
      `${this.githubBaseUrl}/repos/${owner}/${repo}/releases/latest`,
      { headers: this.headers },
    );

    if (res.status === HttpStatus.NOT_FOUND) return null;

    if (this.isRateLimited(res)) {
      const retryAfter = this.parseRetryAfter(res);
      throw new RateLimitError(`Please try again after ${retryAfter} seconds`);
    }

    if (!res.ok)
      throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);

    return gitHubReleaseSchema.parse(await res.json());
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
