import type { VcsRepository } from '@/modules/subscription/types/vcs-repository.type';

export interface IRepositorySource {
  getRepository(owner: string, repo: string): Promise<VcsRepository>;
}
