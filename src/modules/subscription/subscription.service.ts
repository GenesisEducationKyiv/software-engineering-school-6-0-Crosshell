import type { ISubscriptionRepository } from '@/modules/subscription/interfaces/subscription.repository.interface';
import type { SubscriptionWithRepo } from '@/modules/subscription/types/subscription-with-repo.type';
import { NotFoundError } from '@/shared/errors/app.errors';
import type { ISubscriptionService } from './interfaces/subscription.service.interface';

export class SubscriptionService implements ISubscriptionService {
  constructor(
    private readonly subscriptionRepository: ISubscriptionRepository,
  ) {}

  async confirm(token: string): Promise<void> {
    const subscription =
      await this.subscriptionRepository.findByConfirmToken(token);
    if (!subscription) {
      throw new NotFoundError('Confirmation token not found');
    }
    await this.subscriptionRepository.confirm(subscription.id);
  }

  async unsubscribe(token: string): Promise<void> {
    const subscription =
      await this.subscriptionRepository.findByUnsubscribeToken(token);
    if (!subscription) {
      throw new NotFoundError('Unsubscribe token not found');
    }
    await this.subscriptionRepository.deleteById(subscription.id);
  }

  async getSubscriptionsByEmail(
    email: string,
  ): Promise<SubscriptionWithRepo[]> {
    return this.subscriptionRepository.findConfirmedByEmail(email);
  }
}
