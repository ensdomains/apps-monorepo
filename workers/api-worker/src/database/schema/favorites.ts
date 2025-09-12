import { relations } from 'drizzle-orm'
import { pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { users } from './core'
import { ensNames } from './expiry'

export const favorites = pgTable(
  'favorites',
  {
    name: text('name').notNull(),
    user_address: text('user_address')
      .notNull()
      .references(() => users.address, {
        onDelete: 'cascade',
      }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.user_address, table.name],
    }),
  ],
)

export const favoriteRelations = relations(favorites, ({ one }) => ({
  user: one(users, {
    fields: [favorites.user_address],
    references: [users.address],
  }),
  ensName: one(ensNames, {
    fields: [favorites.name],
    references: [ensNames.name],
  }),
}))
