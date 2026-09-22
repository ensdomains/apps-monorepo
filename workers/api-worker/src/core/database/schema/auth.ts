import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const authAttempts = pgTable(
  'auth_attempts',
  {
    nonce: text('nonce').primaryKey(),
    redemption_token_hash: text('redemption_token_hash').notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('auth_attempts_expires_at_index').on(table.expires_at)],
)
