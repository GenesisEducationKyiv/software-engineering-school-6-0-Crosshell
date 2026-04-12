import { sql } from 'drizzle-orm';
import type { Database } from '@/infrastructure/database';

export async function truncateAllTables(db: Database): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE subscriptions, repositories RESTART IDENTITY CASCADE`,
  );
}
