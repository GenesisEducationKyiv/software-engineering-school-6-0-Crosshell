import { Repository } from '@/infrastructure/database/schema';
import { Subscriber } from '@/modules/notification/notification.schemas';

export interface RepositoryWithSubscribers {
  repository: Repository;
  subscribers: Subscriber[];
}
