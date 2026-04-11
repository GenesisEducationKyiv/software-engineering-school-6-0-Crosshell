import { Subscriber } from '@/modules/notification/notification.schemas';
import { TrackedRepository } from './tracked-repository.type';

export interface RepositoryWithSubscribers {
  repository: TrackedRepository;
  subscribers: Subscriber[];
}
