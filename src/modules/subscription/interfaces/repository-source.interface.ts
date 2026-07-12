import type { VcsRepository } from '../types/vcs-repository.type';

export interface IRepositorySource {
  getRepository(repoFullName: string): Promise<VcsRepository>;
}
