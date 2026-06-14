import type { Repository } from './repository.type';
import type { SubscriberInfo } from '@/modules/notification';

export type { SubscriberInfo };

export type RepositoryWithSubscribers = {
  repository: Repository;
  subscribers: SubscriberInfo[];
};
