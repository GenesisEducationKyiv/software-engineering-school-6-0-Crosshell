import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { databaseConfig } from '@/shared/config/database.config';

export const pool = new Pool({ connectionString: databaseConfig.url });
export const db = drizzle(pool, { schema });

export type Database = typeof db;
