import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { resolve } from 'node:path';

const TEST_DATABASE_URL =
  'postgresql://notifier:notifier@localhost:5433/notifier_integration';

export async function setup(): Promise<void> {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });

  try {
    const db = drizzle(pool);
    await migrate(db, {
      migrationsFolder: resolve(process.cwd(), 'drizzle/migrations'),
    });
    console.info('[Integration] Database migrations applied successfully');
  } finally {
    await pool.end();
  }
}
