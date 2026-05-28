import type { Database, DbClient } from './index';
import type { IRepositoryRepository } from '@/modules/repository/interfaces/repository.repository.interface';
import type { ISubscriptionRepository } from '@/modules/subscription/interfaces/subscription.repository.interface';

export interface UnitOfWorkContext {
  repositories: IRepositoryRepository;
  subscriptions: ISubscriptionRepository;
}

export interface IUnitOfWorkContextBuilder {
  build(tx: DbClient): UnitOfWorkContext;
}

export interface IUnitOfWork {
  run<T>(fn: (uow: UnitOfWorkContext) => Promise<T>): Promise<T>;
}

export class UnitOfWork implements IUnitOfWork {
  constructor(
    private readonly db: Database,
    private readonly contextBuilder: IUnitOfWorkContextBuilder,
  ) {}

  async run<T>(fn: (uow: UnitOfWorkContext) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => fn(this.contextBuilder.build(tx)));
  }
}
