import { timestamp, uuid } from 'drizzle-orm/pg-core';

export const baseTableColumns = {
  id: uuid().primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
};
