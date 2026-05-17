import { describe, it, expect } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { UnitOfWorkContextBuilder } from './unit-of-work-context.builder';
import { RepositoryRepository } from '@/modules/repository/repository.repository';
import { SubscriptionRepository } from '@/modules/subscription/subscription.repository';
import type { DbClient } from './index';

describe('UnitOfWorkContextBuilder', () => {
  it('should build a context with a RepositoryRepository instance', () => {
    const tx = mock<DbClient>();
    const builder = new UnitOfWorkContextBuilder();

    const ctx = builder.build(tx);

    expect(ctx.repositories).toBeInstanceOf(RepositoryRepository);
  });

  it('should build a context with a SubscriptionRepository instance', () => {
    const tx = mock<DbClient>();
    const builder = new UnitOfWorkContextBuilder();

    const ctx = builder.build(tx);

    expect(ctx.subscriptions).toBeInstanceOf(SubscriptionRepository);
  });

  it('should pass the transaction to each repository', () => {
    const tx = mock<DbClient>();
    const builder = new UnitOfWorkContextBuilder();

    const ctx = builder.build(tx);

    expect((ctx.repositories as RepositoryRepository)['db']).toBe(tx);
    expect((ctx.subscriptions as SubscriptionRepository)['db']).toBe(tx);
  });
});
