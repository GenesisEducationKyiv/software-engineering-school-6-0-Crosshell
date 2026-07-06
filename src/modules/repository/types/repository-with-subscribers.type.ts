import type { Repository } from './repository.type';
import type { SubscriberInfo } from '@/shared/types';

export type RepositoryWithSubscribers = {
  repository: Repository;
  subscribers: SubscriberInfo[];
};
