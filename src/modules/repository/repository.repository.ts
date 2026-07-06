import type { DbClient } from '@/infrastructure/database';
import {
  repositoriesTable,
  subscriptionsTable,
} from '@/infrastructure/database/schema';
import { and, eq } from 'drizzle-orm';
import type { RepositoryWithSubscribers } from './types/repository-with-subscribers.type';
import type { Repository } from './types/repository.type';
import type { IRepositoryRepository } from './interfaces/repository.repository.interface';

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
          repository: row.repository,
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

  async findOrCreate(owner: string, repo: string): Promise<Repository> {
    const [inserted] = await this.db
      .insert(repositoriesTable)
      .values({ owner, repo })
      .onConflictDoNothing()
      .returning();

    if (inserted) {
      return inserted;
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

    return existing;
  }
}
