import type { VcsRelease } from '@/shared/types/vcs-release.type';

export interface IReleaseFeed {
  getLatestRelease(owner: string, repo: string): Promise<VcsRelease | null>;
}
