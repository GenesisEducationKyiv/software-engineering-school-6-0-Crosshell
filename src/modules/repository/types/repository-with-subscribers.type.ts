import type { Subscriber } from '@/modules/notification/notification.schemas';
import type { TrackedRepository } from './tracked-repository.type';

export interface RepositoryWithSubscribers {
  repository: TrackedRepository;
  subscribers: Subscriber[];
}
