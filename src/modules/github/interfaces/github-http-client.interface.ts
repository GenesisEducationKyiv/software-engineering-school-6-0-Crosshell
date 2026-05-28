import type { GitHubRelease, GitHubRepository } from '../github.schemas';

export interface IGithubHttpClient {
  fetchRepository(owner: string, repo: string): Promise<GitHubRepository>;
  fetchLatestRelease(
    owner: string,
    repo: string,
  ): Promise<GitHubRelease | null>;
}
