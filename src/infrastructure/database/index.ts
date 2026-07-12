import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { databaseConfig } from '@/shared/config';
import { logger } from '@/shared/logger';

export const pool = new Pool({ connectionString: databaseConfig.url });

pool.on('error', (err) => {
  logger.error({ err }, '[Database] Idle client error');
});
export const db = drizzle(pool, { schema });

export type Database = typeof db;

export type DbClient =
  | Database
  | Parameters<Parameters<Database['transaction']>[0]>[0];
