import type { ISubscriptionRepository } from './interfaces/subscription.repository.interface';
import type { SubscribeInput } from './subscription.schemas';
import type { SubscriptionWithRepo } from './types/subscription-with-repo.type';
import type { IRepositorySource } from './interfaces/repository-source.interface';
import type { IMailerService } from '@/modules/mailer';
import { NotFoundError } from '@/shared/errors/app.errors';
import type { IUnitOfWork } from '@/infrastructure/database/unit-of-work';
import type { SubscriptionUoWContext } from './infrastructure/subscription-uow-context.builder';
import type { ISubscriptionService } from './interfaces/subscription.service.interface';
import {
  buildConfirmUrl,
  buildUnsubscribeUrl,
} from '@/shared/utils/url-builders';

export interface SubscriptionServiceConfig {
  appUrl: string;
}

export class SubscriptionService implements ISubscriptionService {
  constructor(
    private readonly uow: IUnitOfWork<SubscriptionUoWContext>,
    private readonly subscriptionRepository: ISubscriptionRepository,
    private readonly repositorySource: IRepositorySource,
    private readonly mailer: IMailerService,
    private readonly config: SubscriptionServiceConfig,
  ) {}

  async subscribe(input: SubscribeInput): Promise<void> {
    const { owner, repo } = await this.repositorySource.getRepository(
      input.repo,
    );

    const sub = await this.uow.run(async ({ repositories, subscriptions }) => {
      const repository = await repositories.findOrCreate(owner, repo);

      return subscriptions.createSubscription({
        email: input.email,
        repositoryId: repository.id,
      });
    });

    const confirmUrl = buildConfirmUrl(sub.confirmToken, this.config.appUrl);
    const unsubscribeUrl = buildUnsubscribeUrl(
      sub.unsubscribeToken,
      this.config.appUrl,
    );
    await this.mailer.sendConfirmationEmail(
      input.email,
      confirmUrl,
      unsubscribeUrl,
    );
  }

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
