import type { DbClient } from '@/infrastructure/database';
import type { IUnitOfWorkContextBuilder } from '@/infrastructure/database/unit-of-work';
import { RepositoryRepository } from '@/modules/repository';
import type { IRepositoryRepository } from '@/modules/repository';
import {
  SubscriptionRepository,
  type ISubscriptionRepository,
} from '@/modules/subscription';
import { SagaRepository } from './saga.repository';
import type { ISagaRepository } from './interfaces/saga.repository.interface';

export interface SubscribeSagaUoWContext {
  repositories: IRepositoryRepository;
  subscriptions: ISubscriptionRepository;
  sagaInstances: ISagaRepository;
}

export class SubscribeSagaUoWContextBuilder implements IUnitOfWorkContextBuilder<SubscribeSagaUoWContext> {
  build(tx: DbClient): SubscribeSagaUoWContext {
    return {
      repositories: new RepositoryRepository(tx),
      subscriptions: new SubscriptionRepository(tx),
      sagaInstances: new SagaRepository(tx),
    };
  }
}
