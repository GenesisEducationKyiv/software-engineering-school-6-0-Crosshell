import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { Database } from '@/infrastructure/database';
import {
  repositoriesTable,
  subscriptionsTable,
  Subscription,
} from '@/infrastructure/database/schema';
import { SubscriptionWithRepo } from '@/modules/subscription/subscription.schemas';

export class SubscriptionRepository {
  constructor(private readonly db: Database) {}

  async findByEmailAndRepositoryId(
    email: string,
    repositoryId: string,
  ): Promise<Subscription | null> {
    const [row] = await this.db
      .select()
      .from(subscriptionsTable)
      .where(
        and(
          eq(subscriptionsTable.email, email),
          eq(subscriptionsTable.repositoryId, repositoryId),
        ),
      );

    return row ?? null;
  }

  async createSubscription(data: {
    email: string;
    repositoryId: string;
  }): Promise<Subscription> {
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
