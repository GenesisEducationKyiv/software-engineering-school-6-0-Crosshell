import type { VcsRelease } from '../types/vcs-release.type';

export interface IReleaseFeed {
  getLatestRelease(owner: string, repo: string): Promise<VcsRelease | null>;
}
