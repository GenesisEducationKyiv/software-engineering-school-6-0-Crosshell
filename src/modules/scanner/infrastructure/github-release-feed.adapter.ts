import type { IGithubHttpClient } from '@/modules/github';
import type { IReleaseFeed } from '../interfaces/release-feed.interface';
import type { VcsRelease } from '../types/vcs-release.type';

export class GithubReleaseFeedAdapter implements IReleaseFeed {
  constructor(private readonly httpClient: IGithubHttpClient) {}

  async getLatestRelease(
    owner: string,
    repo: string,
  ): Promise<VcsRelease | null> {
    const ghRelease = await this.httpClient.fetchLatestRelease(owner, repo);
    if (!ghRelease) {
      return null;
    }

    return { tagName: ghRelease.tagName, releaseUrl: ghRelease.htmlUrl };
  }
}
