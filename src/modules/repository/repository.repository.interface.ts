import type { RepositoryWithSubscribers } from './types/repository-with-subscribers.type';
import type { TrackedRepository } from './types/tracked-repository.type';

export interface IRepositoryRepository {
  getRepositoriesWithActiveSubscriptions(): Promise<
    RepositoryWithSubscribers[]
  >;
  updateLastSeenTag(repositoryId: string, tag: string): Promise<void>;
  findOrCreate(owner: string, repo: string): Promise<TrackedRepository>;
}
