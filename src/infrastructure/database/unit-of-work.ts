import type { Database } from './index';
import { RepositoryRepository } from '@/modules/repository/repository.repository';
import { SubscriptionRepository } from '@/modules/subscription/subscription.repository';

export interface UnitOfWorkContext {
  repositories: RepositoryRepository;
  subscriptions: SubscriptionRepository;
}

export class UnitOfWork {
  constructor(private readonly db: Database) {}

  async run<T>(fn: (uow: UnitOfWorkContext) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      const ctx: UnitOfWorkContext = {
        repositories: new RepositoryRepository(tx),
        subscriptions: new SubscriptionRepository(tx),
      };
      return fn(ctx);
    });
  }
}
