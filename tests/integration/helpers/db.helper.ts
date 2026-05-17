import { sql, type InferSelectModel } from 'drizzle-orm';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, beforeEach } from 'vitest';
import * as schema from '@/infrastructure/database/schema';
import {
  repositoriesTable,
  subscriptionsTable,
} from '@/infrastructure/database/schema';
import type { Database } from '@/infrastructure/database';

export async function truncateAllTables(db: Database): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE subscriptions, repositories RESTART IDENTITY CASCADE`,
  );
}

export function useDb(): { getDb: () => Database } {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env['DATABASE_URL']! });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAllTables(drizzle(pool, { schema }));
  });

  return {
    getDb: (): Database => drizzle(pool, { schema }),
  };
}

export async function seedRepoWithConfirmedSubscriber(
  db: Database,
  owner: string,
  repo: string,
  lastSeenTag: string | null,
  subscriberEmail = 'subscriber@example.com',
): Promise<{
  repoRow: InferSelectModel<typeof repositoriesTable>;
  subRow: InferSelectModel<typeof subscriptionsTable>;
}> {
  const [repoRow] = await db
    .insert(repositoriesTable)
    .values({ owner, repo, lastSeenTag })
    .returning();

  const [subRow] = await db
    .insert(subscriptionsTable)
    .values({
      email: subscriberEmail,
      repositoryId: repoRow.id,
      confirmed: true,
      confirmToken: randomUUID(),
      unsubscribeToken: randomUUID(),
    })
    .returning();

  return { repoRow, subRow };
}
