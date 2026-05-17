import type { IGithubHttpClient } from './interfaces/github-http-client.interface';
import type { IRepositorySource } from '@/modules/subscription/interfaces/repository-source.interface';
import type { IReleaseFeed } from '@/modules/scanner/interfaces/release-feed.interface';
import type { VcsRepository } from '@/shared/types/vcs-repository.type';
import type { VcsRelease } from '@/shared/types/vcs-release.type';

export class GithubAdapter implements IRepositorySource, IReleaseFeed {
  constructor(private readonly httpClient: IGithubHttpClient) {}

  async getRepository(owner: string, repo: string): Promise<VcsRepository> {
    const ghRepo = await this.httpClient.fetchRepository(owner, repo);
    const parts = ghRepo.fullName.split('/');
    if (parts.length !== 2)
      throw new Error(`Unexpected full_name format: ${ghRepo.fullName}`);
    const [repoOwner, repoName] = parts;
    return { owner: repoOwner, repo: repoName };
  }

  async getLatestRelease(
    owner: string,
    repo: string,
  ): Promise<VcsRelease | null> {
    const ghRelease = await this.httpClient.fetchLatestRelease(owner, repo);
    if (!ghRelease) return null;
    return { tagName: ghRelease.tagName, releaseUrl: ghRelease.htmlUrl };
  }
}
