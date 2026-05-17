import type { Database } from './index';
import { RepositoryRepository } from '@/modules/repository/repository.repository';
import { SubscriptionRepository } from '@/modules/subscription/subscription.repository';
import type { IRepositoryRepository } from '@/modules/repository/interfaces/repository.repository.interface';
import type { ISubscriptionRepository } from '@/modules/subscription/interfaces/subscription.repository.interface';

export interface UnitOfWorkContext {
  repositories: IRepositoryRepository;
  subscriptions: ISubscriptionRepository;
}

export interface IUnitOfWork {
  run<T>(fn: (uow: UnitOfWorkContext) => Promise<T>): Promise<T>;
}

export class UnitOfWork implements IUnitOfWork {
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
