import { relations } from 'drizzle-orm'
import { pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './core'
import { ensNames } from './expiry'

export const favorites = pgTable(
  'favorites',
  {
    name: text('name').notNull(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, {
        onDelete: 'cascade',
      }),
    created_at: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.user_id, table.name],
    }),
  ],
)

export const favoriteRelations = relations(favorites, ({ one }) => ({
  user: one(users, {
    fields: [favorites.user_id],
    references: [users.id],
  }),
  ensName: one(ensNames, {
    fields: [favorites.name],
    references: [ensNames.name],
  }),
}))
