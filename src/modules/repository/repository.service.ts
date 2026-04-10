import { Repository } from '@/infrastructure/database/schema';
import { RepositoryRepository } from '@/modules/repository/repository.repository';
import { RepositoryWithSubscribers } from '@/modules/repository/repository.schemas';

export class RepositoryService {
  constructor(private readonly repository: RepositoryRepository) {}

  async getRepositoriesWithActiveSubscriptions(): Promise<
    RepositoryWithSubscribers[]
  > {
    return this.repository.getRepositoriesWithActiveSubscriptions();
  }

  async updateLastSeenTag(repositoryId: string, tag: string): Promise<void> {
    return this.repository.updateLastSeenTag(repositoryId, tag);
  }

  async upsertRepository(owner: string, repo: string): Promise<Repository> {
    return this.repository.upsertRepository(owner, repo);
  }
}
