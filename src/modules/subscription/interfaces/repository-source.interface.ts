import type { VcsRepository } from '@/shared/types/vcs-repository.type';

export interface IRepositorySource {
  getRepository(owner: string, repo: string): Promise<VcsRepository>;
}
