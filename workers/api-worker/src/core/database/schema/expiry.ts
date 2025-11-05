import { relations } from 'drizzle-orm'
import { pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './core'

export const ensNames = pgTable('ens_names', {
  name: text('name').primaryKey(),
  expiry_at: timestamp('expiry_at', { withTimezone: true }),
  last_checked_at: timestamp('last_checked_at', { withTimezone: true }),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const ensNameRelations = relations(ensNames, ({ many }) => ({
  evalPointers: many(ensEvalPointers),
  watchers: many(ensWatchers),
}))

// ===============================

export const ensEvalPointers = pgTable('ens_eval_pointers', {
  name: text('name')
    .primaryKey()
    .references(() => ensNames.name, {
      onDelete: 'cascade',
    }),
  next_eval_at: timestamp('next_eval_at', { withTimezone: true }).notNull(),
  lease_until: timestamp('lease_until', { withTimezone: true }).notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const ensEvalPointerRelations = relations(
  ensEvalPointers,
  ({ one }) => ({
    ensName: one(ensNames, {
      fields: [ensEvalPointers.name],
      references: [ensNames.name],
    }),
  }),
)

// ===============================

export const ensWatchers = pgTable(
  'ens_watchers',
  {
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, {
        onDelete: 'cascade',
      }),
    name: text('name')
      .notNull()
      .references(() => ensNames.name, {
        onDelete: 'cascade',
      }),
  },
  (table) => [
    primaryKey({
      columns: [table.user_id, table.name],
    }),
  ],
)

export const ensWatcherRelations = relations(ensWatchers, ({ one }) => ({
  ensName: one(ensNames, {
    fields: [ensWatchers.name],
    references: [ensNames.name],
  }),
  user: one(users, {
    fields: [ensWatchers.user_id],
    references: [users.id],
  }),
}))
