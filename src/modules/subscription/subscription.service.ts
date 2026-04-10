import { SubscriptionRepository } from '@/modules/subscription/subscription.repository';
import {
  SubscribeInput,
  SubscriptionWithRepo,
} from '@/modules/subscription/subscription.schemas';
import { GithubClient } from '@/modules/github/github.client';
import { MailerService } from '@/modules/mailer/mailer.service';
import { RepositoryService } from '@/modules/repository/repository.service';
import { ConflictError, NotFoundError } from '@/shared/errors/app.errors';
import { appConfig } from '@/shared/config/app.config';

export class SubscriptionService {
  constructor(
    private readonly repository: SubscriptionRepository,
    private readonly repositoryService: RepositoryService,
    private readonly github: GithubClient,
    private readonly mailer: MailerService,
  ) {}

  async subscribe(input: SubscribeInput): Promise<void> {
    const [owner, repo] = input.repo.split('/');

    await this.github.getRepository(owner, repo);

    const repository = await this.repositoryService.upsertRepository(
      owner,
      repo,
    );

    const existing = await this.repository.findByEmailAndRepositoryId(
      input.email,
      repository.id,
    );

    if (existing) {
      throw new ConflictError('Email is already subscribed to this repository');
    }

    const subscription = await this.repository.createSubscription({
      email: input.email,
      repositoryId: repository.id,
    });

    const confirmUrl = `${appConfig.appUrl}/api/confirm/${subscription.confirmToken}`;
    await this.mailer.sendConfirmationEmail(input.email, confirmUrl);
  }

  async confirm(token: string): Promise<void> {
    const subscription = await this.repository.findByConfirmToken(token);
    if (!subscription) throw new NotFoundError('Confirmation token not found');
    await this.repository.confirm(subscription.id);
  }

  async unsubscribe(token: string): Promise<void> {
    const subscription = await this.repository.findByUnsubscribeToken(token);
    if (!subscription) throw new NotFoundError('Unsubscribe token not found');
    await this.repository.deleteById(subscription.id);
  }

  async getSubscriptionsByEmail(
    email: string,
  ): Promise<SubscriptionWithRepo[]> {
    return this.repository.findConfirmedByEmail(email);
  }
}
