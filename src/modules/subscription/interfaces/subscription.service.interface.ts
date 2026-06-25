import type { SubscriptionWithRepo } from '../types/subscription-with-repo.type';

export interface ISubscriptionService {
  confirm(token: string): Promise<void>;
  unsubscribe(token: string): Promise<void>;
  getSubscriptionsByEmail(email: string): Promise<SubscriptionWithRepo[]>;
}
