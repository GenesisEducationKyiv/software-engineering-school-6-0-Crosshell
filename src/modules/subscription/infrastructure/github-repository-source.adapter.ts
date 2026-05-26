import type { IGithubHttpClient } from '@/modules/github/interfaces/github-http-client.interface';
import type { IRepositorySource } from '../interfaces/repository-source.interface';
import type { VcsRepository } from '../types/vcs-repository.type';

export class GithubRepositorySourceAdapter implements IRepositorySource {
  constructor(private readonly httpClient: IGithubHttpClient) {}

  async getRepository(repoFullName: string): Promise<VcsRepository> {
    const [owner, repo] = repoFullName.split('/');
    const ghRepo = await this.httpClient.fetchRepository(owner, repo);

    return { owner: ghRepo.owner, repo: ghRepo.repo };
  }
}
