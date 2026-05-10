import type { Subscription } from '@/infrastructure/database/schema';
import type { CreateSubscriptionData } from './types/create-subscription-data.type';
import type { SubscriptionWithRepo } from './types/subscription-with-repo.type';

export interface ISubscriptionRepository {
  existsByEmailAndRepo(
    email: string,
    owner: string,
    repo: string,
  ): Promise<boolean>;
  createSubscription(data: CreateSubscriptionData): Promise<Subscription>;
  findByConfirmToken(token: string): Promise<Subscription | null>;
  findByUnsubscribeToken(token: string): Promise<Subscription | null>;
  confirm(id: string): Promise<void>;
  deleteById(id: string): Promise<void>;
  findConfirmedByEmail(email: string): Promise<SubscriptionWithRepo[]>;
}
