import type { DbClient } from '@/infrastructure/database';
import type { IUnitOfWorkContextBuilder } from '@/infrastructure/database/unit-of-work';
import { RepositoryRepository } from '@/modules/repository';
import type { IRepositoryRepository } from '@/modules/repository';
import { SubscriptionRepository } from '../subscription.repository';
import type { ISubscriptionRepository } from '../interfaces/subscription.repository.interface';

export interface SubscriptionUoWContext {
  repositories: IRepositoryRepository;
  subscriptions: ISubscriptionRepository;
}

export class SubscriptionUoWContextBuilder implements IUnitOfWorkContextBuilder<SubscriptionUoWContext> {
  build(tx: DbClient): SubscriptionUoWContext {
    return {
      repositories: new RepositoryRepository(tx),
      subscriptions: new SubscriptionRepository(tx),
    };
  }
}
