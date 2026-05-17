import type { GitHubRelease, GitHubRepository } from '../github.schemas';

export interface IGithubClient {
  getRepository(owner: string, repo: string): Promise<GitHubRepository>;
  getLatestRelease(owner: string, repo: string): Promise<GitHubRelease | null>;
}
