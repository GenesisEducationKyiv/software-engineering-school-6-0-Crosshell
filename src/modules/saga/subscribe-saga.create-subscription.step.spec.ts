import { describe, it, expect, beforeEach } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import { CreateSubscriptionStep } from './subscribe-saga.create-subscription.step';
import type { IUnitOfWork } from '@/infrastructure/database/unit-of-work';
import type { SubscribeSagaUoWContext } from './subscribe-saga.uow-context.builder';
import type {
  IRepositorySource,
  SubscribeInput,
  Subscription,
} from '@/modules/subscription';
import type { Repository } from '@/modules/repository';

const VALID_INPUT: SubscribeInput = {
  email: 'user@example.com',
  repo: 'owner/repo',
};

const CORRELATION_ID = 'corr-1';

const MOCK_REPOSITORY: Repository = {
  id: 'repo-uuid-1',
  owner: 'owner',
  repo: 'repo',
  lastSeenTag: null,
};

const MOCK_SUBSCRIPTION: Subscription = {
  id: 'sub-uuid-1',
  email: 'user@example.com',
  repositoryId: 'repo-uuid-1',
  confirmed: false,
  confirmToken: 'confirm-token',
  unsubscribeToken: 'unsub-token',
};

describe('CreateSubscriptionStep', () => {
  let step: CreateSubscriptionStep;
  let uow: ReturnType<typeof mock<IUnitOfWork<SubscribeSagaUoWContext>>>;
  let txCtx: ReturnType<typeof mockDeep<SubscribeSagaUoWContext>>;
  let repositorySource: ReturnType<typeof mock<IRepositorySource>>;

  beforeEach(() => {
    txCtx = mockDeep<SubscribeSagaUoWContext>();
    txCtx.repositories.findOrCreate.mockResolvedValue(MOCK_REPOSITORY);
    txCtx.subscriptions.createSubscription.mockResolvedValue(MOCK_SUBSCRIPTION);
    txCtx.sagaInstances.create.mockResolvedValue(undefined);

    uow = mock<IUnitOfWork<SubscribeSagaUoWContext>>();
    uow.run.mockImplementation((fn) => fn(txCtx));

    repositorySource = mock<IRepositorySource>();
    repositorySource.getRepository.mockResolvedValue({
      owner: 'owner',
      repo: 'repo',
    });

    step = new CreateSubscriptionStep(uow, repositorySource, {
      appUrl: 'http://localhost',
    });
  });

  it('resolves the repository from the repository source', async () => {
    await step.execute(VALID_INPUT, CORRELATION_ID);

    expect(repositorySource.getRepository).toHaveBeenCalledWith(
      VALID_INPUT.repo,
    );
  });

  it('creates the subscription and the saga instance inside the same UoW.run call', async () => {
    let subCreatedInTx = false;
    let sagaCreatedInTx = false;

    uow.run.mockImplementationOnce(async (fn) => {
      const innerCtx = mockDeep<SubscribeSagaUoWContext>();
      innerCtx.repositories.findOrCreate.mockResolvedValue(MOCK_REPOSITORY);
      innerCtx.subscriptions.createSubscription.mockImplementation(async () => {
        subCreatedInTx = true;

        return MOCK_SUBSCRIPTION;
      });
      innerCtx.sagaInstances.create.mockImplementation(async () => {
        sagaCreatedInTx = true;
      });

      return fn(innerCtx);
    });

    await step.execute(VALID_INPUT, CORRELATION_ID);

    expect(subCreatedInTx).toBe(true);
    expect(sagaCreatedInTx).toBe(true);
  });

  it('creates the saga instance with SUBSCRIPTION_CREATED status and correlationId', async () => {
    await step.execute(VALID_INPUT, CORRELATION_ID);

    expect(txCtx.sagaInstances.create).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: CORRELATION_ID,
        type: 'SUBSCRIBE',
        status: 'SUBSCRIPTION_CREATED',
      }),
    );
  });

  it('returns the subscription id and the confirm/unsubscribe URLs', async () => {
    const result = await step.execute(VALID_INPUT, CORRELATION_ID);

    expect(result).toEqual({
      subscriptionId: MOCK_SUBSCRIPTION.id,
      confirmUrl: 'http://localhost/confirm.html?token=confirm-token',
      unsubscribeUrl: 'http://localhost/unsubscribe.html?token=unsub-token',
    });
  });
});
