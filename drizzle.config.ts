import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

export default defineConfig({
  out: './drizzle/migrations',
  schema: './src/infrastructure/database/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: connectionString,
  },
  verbose: true,
  strict: true,
});
