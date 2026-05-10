import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { DbClient } from '@/infrastructure/database';
import type { Subscription } from '@/infrastructure/database/schema';
import {
  repositoriesTable,
  subscriptionsTable,
} from '@/infrastructure/database/schema';
import type { SubscriptionWithRepo } from '@/modules/subscription/types/subscription-with-repo.type';
import type { CreateSubscriptionData } from '@/modules/subscription/types/create-subscription-data.type';
import type { ISubscriptionRepository } from './subscription.repository.interface';

export class SubscriptionRepository implements ISubscriptionRepository {
  constructor(private readonly db: DbClient) {}

  async existsByEmailAndRepo(
    email: string,
    owner: string,
    repo: string,
  ): Promise<boolean> {
    const [row] = await this.db
      .select({ id: subscriptionsTable.id })
      .from(subscriptionsTable)
      .innerJoin(
        repositoriesTable,
        eq(subscriptionsTable.repositoryId, repositoriesTable.id),
      )
      .where(
        and(
          eq(subscriptionsTable.email, email),
          eq(repositoriesTable.owner, owner),
          eq(repositoriesTable.repo, repo),
        ),
      )
      .limit(1);

    return row !== undefined;
  }

  async createSubscription(
    data: CreateSubscriptionData,
  ): Promise<Subscription> {
    const [subscription] = await this.db
      .insert(subscriptionsTable)
      .values({
        email: data.email,
        repositoryId: data.repositoryId,
        confirmToken: randomUUID(),
        unsubscribeToken: randomUUID(),
      })
      .returning();

    return subscription;
  }

  async findByConfirmToken(token: string): Promise<Subscription | null> {
    const [row] = await this.db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.confirmToken, token));

    return row ?? null;
  }

  async findByUnsubscribeToken(token: string): Promise<Subscription | null> {
    const [row] = await this.db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.unsubscribeToken, token));

    return row ?? null;
  }

  async confirm(id: string): Promise<void> {
    await this.db
      .update(subscriptionsTable)
      .set({ confirmed: true })
      .where(eq(subscriptionsTable.id, id));
  }

  async deleteById(id: string): Promise<void> {
    await this.db
      .delete(subscriptionsTable)
      .where(eq(subscriptionsTable.id, id));
  }

  async findConfirmedByEmail(email: string): Promise<SubscriptionWithRepo[]> {
    const rows = await this.db
      .select({
        email: subscriptionsTable.email,
        confirmed: subscriptionsTable.confirmed,
        owner: repositoriesTable.owner,
        repo: repositoriesTable.repo,
        lastSeenTag: repositoriesTable.lastSeenTag,
      })
      .from(subscriptionsTable)
      .innerJoin(
        repositoriesTable,
        eq(subscriptionsTable.repositoryId, repositoriesTable.id),
      )
      .where(
        and(
          eq(subscriptionsTable.email, email),
          eq(subscriptionsTable.confirmed, true),
        ),
      );

    return rows.map((row) => ({
      email: row.email,
      repo: `${row.owner}/${row.repo}`,
      confirmed: row.confirmed ?? true,
      lastSeenTag: row.lastSeenTag,
    }));
  }
}
