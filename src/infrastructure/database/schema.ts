import {
  boolean,
  jsonb,
  pgTable,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { baseTableColumns } from '@/infrastructure/database/helpers/columns.helper';
import { relations } from 'drizzle-orm';

export const repositoriesTable = pgTable(
  'repositories',
  {
    ...baseTableColumns,
    owner: varchar({ length: 256 }).notNull(),
    repo: varchar({ length: 256 }).notNull(),
    lastSeenTag: varchar('last_seen_tag', { length: 256 }),
  },
  (table) => [unique('owner_repo_unq').on(table.owner, table.repo)],
);

export const subscriptionsTable = pgTable(
  'subscriptions',
  {
    ...baseTableColumns,
    email: varchar({ length: 256 }).notNull(),
    repositoryId: uuid('repository_id')
      .notNull()
      .references(() => repositoriesTable.id, { onDelete: 'cascade' }),
    confirmed: boolean().default(false).notNull(),
    confirmToken: varchar('confirm_token', { length: 64 }).notNull().unique(),
    unsubscribeToken: varchar('unsubscribe_token', { length: 64 })
      .notNull()
      .unique(),
  },
  (table) => [
    unique('email_repository_id_unq').on(table.email, table.repositoryId),
  ],
);

export const sagaInstancesTable = pgTable('saga_instances', {
  ...baseTableColumns,
  correlationId: varchar('correlation_id', { length: 64 }).notNull().unique(),
  type: varchar({ length: 64 }).notNull(),
  status: varchar({ length: 32 }).notNull(),
  payload: jsonb().notNull(),
});

export const repositoriesRelations = relations(
  repositoriesTable,
  ({ many }) => ({
    subscriptions: many(subscriptionsTable),
  }),
);

export const subscriptionsRelations = relations(
  subscriptionsTable,
  ({ one }) => ({
    repository: one(repositoriesTable, {
      fields: [subscriptionsTable.repositoryId],
      references: [repositoriesTable.id],
    }),
  }),
);
