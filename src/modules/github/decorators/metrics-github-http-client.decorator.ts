import type { IGithubHttpClient } from '../interfaces/github-http-client.interface';
import type { GitHubRelease, GitHubRepository } from '../github.schemas';
import type { IGithubApiMetrics } from '../interfaces/github-metrics.interface';

export class MetricsGithubHttpClientDecorator implements IGithubHttpClient {
  constructor(
    private readonly inner: IGithubHttpClient,
    private readonly metrics: IGithubApiMetrics,
  ) {}

  async fetchRepository(
    owner: string,
    repo: string,
  ): Promise<GitHubRepository> {
    this.metrics.incApiRequest('fetchRepository');

    return this.inner.fetchRepository(owner, repo);
  }

  async fetchLatestRelease(
    owner: string,
    repo: string,
  ): Promise<GitHubRelease | null> {
    this.metrics.incApiRequest('fetchLatestRelease');

    return this.inner.fetchLatestRelease(owner, repo);
  }
}
