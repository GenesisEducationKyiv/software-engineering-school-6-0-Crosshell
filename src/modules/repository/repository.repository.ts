import { Database } from '@/infrastructure/database';
import {
  repositoriesTable,
  Repository,
  subscriptionsTable,
} from '@/infrastructure/database/schema';
import { eq } from 'drizzle-orm';
import { RepositoryWithSubscribers } from '@/modules/repository/repository.schemas';

export class RepositoryRepository {
  constructor(private readonly db: Database) {}

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

  async upsertRepository(owner: string, repo: string): Promise<Repository> {
    const [row] = await this.db
      .insert(repositoriesTable)
      .values({ owner, repo })
      .onConflictDoUpdate({
        target: [repositoriesTable.owner, repositoriesTable.repo],
        set: { updatedAt: new Date() },
      })
      .returning();

    return row;
  }
}
