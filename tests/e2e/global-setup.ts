import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { resolve } from 'node:path';

const E2E_DATABASE_URL =
  'postgresql://notifier:notifier@localhost:5434/notifier_e2e';

export default async function globalSetup(): Promise<void> {
  const pool = new Pool({ connectionString: E2E_DATABASE_URL });
  try {
    const db = drizzle(pool);
    await migrate(db, {
      migrationsFolder: resolve(process.cwd(), 'drizzle/migrations'),
    });
    console.info('[E2E] Database migrations applied successfully');
  } finally {
    await pool.end();
  }
}
