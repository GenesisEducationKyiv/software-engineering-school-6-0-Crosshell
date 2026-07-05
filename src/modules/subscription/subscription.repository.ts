import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { DbClient } from '@/infrastructure/database';
import type { Subscription } from '@/modules/subscription/types/subscription.type';
import {
  repositoriesTable,
  subscriptionsTable,
  SUBSCRIPTION_EMAIL_REPO_UNIQUE,
} from '@/infrastructure/database/schema';
import type { SubscriptionWithRepo } from '@/modules/subscription/types/subscription-with-repo.type';
import type { CreateSubscriptionData } from '@/modules/subscription/types/create-subscription-data.type';
import type { ISubscriptionRepository } from './interfaces/subscription.repository.interface';
import { isUniqueConstraintErrorFor } from '@/infrastructure/database/helpers/pg-errors.helper';
import { ConflictError } from '@/shared/errors/app.errors';

export class SubscriptionRepository implements ISubscriptionRepository {
  constructor(private readonly db: DbClient) {}

  async createSubscription(
    data: CreateSubscriptionData,
  ): Promise<Subscription> {
    try {
      const [row] = await this.db
        .insert(subscriptionsTable)
        .values({
          email: data.email,
          repositoryId: data.repositoryId,
          confirmToken: randomUUID(),
          unsubscribeToken: randomUUID(),
        })
        .returning();

      return row;
    } catch (err) {
      if (isUniqueConstraintErrorFor(err, SUBSCRIPTION_EMAIL_REPO_UNIQUE)) {
        throw new ConflictError(
          'Email is already subscribed to this repository',
        );
      }
      throw err;
    }
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
      owner: row.owner,
      repo: row.repo,
      confirmed: row.confirmed ?? true,
      lastSeenTag: row.lastSeenTag,
    }));
  }
}
