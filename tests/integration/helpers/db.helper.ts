import { sql, eq } from 'drizzle-orm';
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

type RepoRow = typeof repositoriesTable.$inferSelect;
type SubRow = typeof subscriptionsTable.$inferSelect;

export function useDb(): {
  getDb: () => Database;
  seedRepoWithConfirmedSubscriber: (
    owner: string,
    repo: string,
    lastSeenTag: string | null,
    subscriberEmail?: string,
  ) => Promise<{ repoRow: RepoRow; subRow: SubRow }>;
  insertRepo: (
    owner: string,
    repo: string,
    lastSeenTag: string | null,
  ) => Promise<RepoRow>;
  insertSubscription: (
    email: string,
    repositoryId: string,
    confirmed: boolean,
  ) => Promise<SubRow>;
  getRepoById: (id: string) => Promise<RepoRow | null>;
} {
  let pool: Pool;
  let db: Database;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env['DATABASE_URL']! });
    db = drizzle(pool, { schema });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(
      sql`TRUNCATE TABLE subscriptions, repositories RESTART IDENTITY CASCADE`,
    );
  });

  const getDb = () => db;

  async function seedRepoWithConfirmedSubscriber(
    owner: string,
    repo: string,
    lastSeenTag: string | null,
    subscriberEmail = 'subscriber@example.com',
  ) {
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

  async function insertRepo(
    owner: string,
    repo: string,
    lastSeenTag: string | null,
  ) {
    const [row] = await db
      .insert(repositoriesTable)
      .values({ owner, repo, lastSeenTag })
      .returning();

    return row;
  }

  async function insertSubscription(
    email: string,
    repositoryId: string,
    confirmed: boolean,
  ) {
    const [row] = await db
      .insert(subscriptionsTable)
      .values({
        email,
        repositoryId,
        confirmed,
        confirmToken: randomUUID(),
        unsubscribeToken: randomUUID(),
      })
      .returning();

    return row;
  }

  async function getRepoById(id: string) {
    const [row] = await db
      .select()
      .from(repositoriesTable)
      .where(eq(repositoriesTable.id, id));

    return row ?? null;
  }

  return {
    getDb,
    seedRepoWithConfirmedSubscriber,
    insertRepo,
    insertSubscription,
    getRepoById,
  };
}
