import type { Subscription } from './types/subscription.type';
import type { CreateSubscriptionData } from './types/create-subscription-data.type';
import type { SubscriptionWithRepo } from './types/subscription-with-repo.type';

export interface ISubscriptionRepository {
  createSubscription(data: CreateSubscriptionData): Promise<Subscription>;
  findByConfirmToken(token: string): Promise<Subscription | null>;
  findByUnsubscribeToken(token: string): Promise<Subscription | null>;
  confirm(id: string): Promise<void>;
  deleteById(id: string): Promise<void>;
  findConfirmedByEmail(email: string): Promise<SubscriptionWithRepo[]>;
}
