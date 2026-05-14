import type { Subscriber } from '@/modules/notification/notification.schemas';
import type { Repository } from '@/modules/repository/types/repository.type';

export interface RepositoryWithSubscribers {
  repository: Repository;
  subscribers: Subscriber[];
}
