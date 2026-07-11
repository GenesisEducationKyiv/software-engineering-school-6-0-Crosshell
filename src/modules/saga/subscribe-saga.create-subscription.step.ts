import type { IUnitOfWork } from '@/infrastructure/database/unit-of-work';
import type { IRepositorySource, SubscribeInput } from '@/modules/subscription';
import {
  buildConfirmUrl,
  buildUnsubscribeUrl,
} from '@/shared/utils/url-builders';
import type { SubscribeSagaUoWContext } from './subscribe-saga.uow-context.builder';

export interface CreateSubscriptionStepConfig {
  appUrl: string;
}

export interface CreateSubscriptionStepResult {
  subscriptionId: string;
  confirmUrl: string;
  unsubscribeUrl: string;
}

export class CreateSubscriptionStep {
  constructor(
    private readonly uow: IUnitOfWork<SubscribeSagaUoWContext>,
    private readonly repositorySource: IRepositorySource,
    private readonly config: CreateSubscriptionStepConfig,
  ) {}

  async execute(
    input: SubscribeInput,
    correlationId: string,
  ): Promise<CreateSubscriptionStepResult> {
    const { owner, repo } = await this.repositorySource.getRepository(
      input.repo,
    );

    return this.uow.run(
      async ({ repositories, subscriptions, sagaInstances }) => {
        const repository = await repositories.findOrCreate(owner, repo);

        const sub = await subscriptions.createSubscription({
          email: input.email,
          repositoryId: repository.id,
        });

        const confirmUrl = buildConfirmUrl(
          sub.confirmToken,
          this.config.appUrl,
        );
        const unsubscribeUrl = buildUnsubscribeUrl(
          sub.unsubscribeToken,
          this.config.appUrl,
        );

        await sagaInstances.create({
          correlationId,
          type: 'SUBSCRIBE',
          status: 'SUBSCRIPTION_CREATED',
          payload: {
            subscriptionId: sub.id,
            email: input.email,
            confirmUrl,
            unsubscribeUrl,
          },
        });

        return { subscriptionId: sub.id, confirmUrl, unsubscribeUrl };
      },
    );
  }
}
