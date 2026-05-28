import type { DbClient } from './index';
import type {
  IUnitOfWorkContextBuilder,
  UnitOfWorkContext,
} from './unit-of-work';
import { RepositoryRepository } from '@/modules/repository/repository.repository';
import { SubscriptionRepository } from '@/modules/subscription/subscription.repository';

export class UnitOfWorkContextBuilder implements IUnitOfWorkContextBuilder {
  build(tx: DbClient): UnitOfWorkContext {
    return {
      repositories: new RepositoryRepository(tx),
      subscriptions: new SubscriptionRepository(tx),
    };
  }
}
