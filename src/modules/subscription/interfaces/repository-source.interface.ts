import type { VcsRepository } from '@/modules/subscription/types/vcs-repository.type';

export interface IRepositorySource {
  getRepository(repoFullName: string): Promise<VcsRepository>;
}
