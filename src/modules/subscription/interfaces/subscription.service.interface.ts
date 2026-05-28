import type { SubscribeInput } from '../subscription.schemas';
import type { SubscriptionWithRepo } from '../types/subscription-with-repo.type';

export interface ISubscriptionService {
  subscribe(input: SubscribeInput): Promise<void>;
  confirm(token: string): Promise<void>;
  unsubscribe(token: string): Promise<void>;
  getSubscriptionsByEmail(email: string): Promise<SubscriptionWithRepo[]>;
}
