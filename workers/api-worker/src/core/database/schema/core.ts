import { relations } from 'drizzle-orm'
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { randomUUIDv7 } from '../utils/schemaHelpers'
import { ensWatchers } from './expiry'
import { favorites } from './favorites'
import { notifications, userChannels } from './notifications'

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().default(randomUUIDv7),
    address: text('address').notNull().unique(),
  },
  (table) => [index('users_address_index').on(table.address)],
)

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().default(randomUUIDv7),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    refresh_token_hash: text('refresh_token_hash').notNull(),
    previous_refresh_token_hash: text('previous_refresh_token_hash'),
    siwe_domain: text('siwe_domain').notNull(),
    created_user_agent: text('created_user_agent'),
    created_ip: text('created_ip'),
    rotated_at: timestamp('rotated_at', { withTimezone: true }),
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('sessions_user_id_index').on(table.user_id),
    index('sessions_refresh_hash_index').on(table.refresh_token_hash),
  ],
)

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.user_id],
    references: [users.id],
  }),
}))

export const usersRelations = relations(users, ({ many }) => ({
  watchers: many(ensWatchers),
  favorites: many(favorites),
  notifications: many(notifications),
  userChannels: many(userChannels),
  sessions: many(sessions),
}))
