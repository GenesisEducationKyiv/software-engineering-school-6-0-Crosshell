import type { DbClient } from '@/infrastructure/database';
import {
  repositoriesTable,
  subscriptionsTable,
} from '@/infrastructure/database/schema';
import { and, eq } from 'drizzle-orm';
import type { RepositoryWithSubscribers } from '@/modules/repository/types/repository-with-subscribers.type';
import type { TrackedRepository } from '@/modules/repository/types/tracked-repository.type';
import type { IRepositoryRepository } from './repository.repository.interface';

export class RepositoryRepository implements IRepositoryRepository {
  constructor(private readonly db: DbClient) {}

  async getRepositoriesWithActiveSubscriptions(): Promise<
    RepositoryWithSubscribers[]
  > {
    const rows = await this.db
      .select({
        repository: repositoriesTable,
        email: subscriptionsTable.email,
        unsubscribeToken: subscriptionsTable.unsubscribeToken,
      })
      .from(repositoriesTable)
      .innerJoin(
        subscriptionsTable,
        eq(subscriptionsTable.repositoryId, repositoriesTable.id),
      )
      .where(eq(subscriptionsTable.confirmed, true));

    const map = new Map<string, RepositoryWithSubscribers>();
    for (const row of rows) {
      const existing = map.get(row.repository.id);
      const subscriber = {
        email: row.email,
        unsubscribeToken: row.unsubscribeToken,
      };
      if (existing) {
        existing.subscribers.push(subscriber);
      } else {
        map.set(row.repository.id, {
          repository: {
            id: row.repository.id,
            owner: row.repository.owner,
            repo: row.repository.repo,
            lastSeenTag: row.repository.lastSeenTag,
          },
          subscribers: [subscriber],
        });
      }
    }

    return Array.from(map.values());
  }

  async updateLastSeenTag(repositoryId: string, tag: string): Promise<void> {
    await this.db
      .update(repositoriesTable)
      .set({ lastSeenTag: tag })
      .where(eq(repositoriesTable.id, repositoryId));
  }

  async findOrCreate(owner: string, repo: string): Promise<TrackedRepository> {
    const [inserted] = await this.db
      .insert(repositoriesTable)
      .values({ owner, repo })
      .onConflictDoNothing()
      .returning();

    if (inserted) {
      return this.toTrackedRepository(inserted);
    }

    const [existing] = await this.db
      .select()
      .from(repositoriesTable)
      .where(
        and(
          eq(repositoriesTable.owner, owner),
          eq(repositoriesTable.repo, repo),
        ),
      );

    return this.toTrackedRepository(existing);
  }

  private toTrackedRepository(
    row: typeof repositoriesTable.$inferSelect,
  ): TrackedRepository {
    return {
      id: row.id,
      owner: row.owner,
      repo: row.repo,
      lastSeenTag: row.lastSeenTag,
    };
  }
}
