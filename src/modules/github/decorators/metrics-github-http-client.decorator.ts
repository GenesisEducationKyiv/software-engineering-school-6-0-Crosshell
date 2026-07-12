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
    const start = performance.now();
    this.metrics.incApiRequest('fetchRepository');
    try {
      return await this.inner.fetchRepository(owner, repo);
    } catch (err) {
      this.metrics.incApiError('fetchRepository');
      throw err;
    } finally {
      this.metrics.observeApiDuration(
        'fetchRepository',
        (performance.now() - start) / 1000,
      );
    }
  }

  async fetchLatestRelease(
    owner: string,
    repo: string,
  ): Promise<GitHubRelease | null> {
    const start = performance.now();
    this.metrics.incApiRequest('fetchLatestRelease');
    try {
      return await this.inner.fetchLatestRelease(owner, repo);
    } catch (err) {
      this.metrics.incApiError('fetchLatestRelease');
      throw err;
    } finally {
      this.metrics.observeApiDuration(
        'fetchLatestRelease',
        (performance.now() - start) / 1000,
      );
    }
  }
}
