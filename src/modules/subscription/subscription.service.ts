import type { SubscriptionRepository } from '@/modules/subscription/subscription.repository';
import type { SubscribeInput } from '@/modules/subscription/subscription.schemas';
import type { SubscriptionWithRepo } from '@/modules/subscription/types/subscription-with-repo.type';
import type { GithubClient } from '@/modules/github/github.client';
import type { MailerService } from '@/modules/mailer/mailer.service';
import { ConflictError, NotFoundError } from '@/shared/errors/app.errors';
import { isUniqueConstraintError } from '@/infrastructure/database/helpers/pg-errors.helper';
import type { UnitOfWork } from '@/infrastructure/database/unit-of-work';
import { buildConfirmUrl } from '@/modules/subscription/subscription.urls';

export class SubscriptionService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly github: GithubClient,
    private readonly mailer: MailerService,
  ) {}

  async subscribe(input: SubscribeInput): Promise<void> {
    const [owner, repo] = input.repo.split('/');
    await this.github.getRepository(owner, repo);

    const sub = await this.uow.run(async ({ repositories, subscriptions }) => {
      const repository = await repositories.findOrCreate(owner, repo);
      try {
        return await subscriptions.createSubscription({
          email: input.email,
          repositoryId: repository.id,
        });
      } catch (err) {
        if (isUniqueConstraintError(err)) {
          throw new ConflictError(
            'Email is already subscribed to this repository',
          );
        }
        throw err;
      }
    });

    const confirmUrl = buildConfirmUrl(sub.confirmToken);
    await this.mailer.sendConfirmationEmail(input.email, confirmUrl);
  }

  async confirm(token: string): Promise<void> {
    const subscription =
      await this.subscriptionRepository.findByConfirmToken(token);
    if (!subscription) throw new NotFoundError('Confirmation token not found');
    await this.subscriptionRepository.confirm(subscription.id);
  }

  async unsubscribe(token: string): Promise<void> {
    const subscription =
      await this.subscriptionRepository.findByUnsubscribeToken(token);
    if (!subscription) throw new NotFoundError('Unsubscribe token not found');
    await this.subscriptionRepository.deleteById(subscription.id);
  }

  async getSubscriptionsByEmail(
    email: string,
  ): Promise<SubscriptionWithRepo[]> {
    return this.subscriptionRepository.findConfirmedByEmail(email);
  }
}
