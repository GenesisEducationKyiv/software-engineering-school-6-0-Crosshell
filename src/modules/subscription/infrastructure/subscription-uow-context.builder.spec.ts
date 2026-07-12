import { describe, it, expect } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { SubscriptionUoWContextBuilder } from './subscription-uow-context.builder';
import { RepositoryRepository } from '@/modules/repository';
import { SubscriptionRepository } from '../subscription.repository';
import type { DbClient } from '@/infrastructure/database';

describe('SubscriptionUoWContextBuilder', () => {
  it.each([
    ['repositories', RepositoryRepository],
    ['subscriptions', SubscriptionRepository],
  ] as const)('should build a context with a %s instance', (key, Repo) => {
    const tx = mock<DbClient>();
    const builder = new SubscriptionUoWContextBuilder();

    const ctx = builder.build(tx);

    expect(ctx[key]).toBeInstanceOf(Repo);
  });

  it('should pass the transaction to each repository', () => {
    const tx = mock<DbClient>();
    const builder = new SubscriptionUoWContextBuilder();

    const ctx = builder.build(tx);

    expect((ctx.repositories as RepositoryRepository)['db']).toBe(tx);
    expect((ctx.subscriptions as SubscriptionRepository)['db']).toBe(tx);
  });
});
