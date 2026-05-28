import type { RepositoryWithSubscribers } from '../types/repository-with-subscribers.type';
import type { Repository } from '@/modules/repository/types/repository.type';

export interface IRepositoryRepository {
  getRepositoriesWithActiveSubscriptions(): Promise<
    RepositoryWithSubscribers[]
  >;
  updateLastSeenTag(repositoryId: string, tag: string): Promise<void>;
  findOrCreate(owner: string, repo: string): Promise<Repository>;
}
