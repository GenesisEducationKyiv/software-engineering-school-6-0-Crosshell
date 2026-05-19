import type { VcsRelease } from '@/modules/scanner/types/vcs-release.type';

export interface IReleaseFeed {
  getLatestRelease(owner: string, repo: string): Promise<VcsRelease | null>;
}
