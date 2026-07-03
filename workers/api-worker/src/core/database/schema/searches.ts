import { sql } from 'drizzle-orm'
import { date, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * Per-name search tracking, backing the "N unique searches in the last 30
 * days" stat on the price-cooldown panel.
 *
 * One row per (name, searcher, day): repeat searches by the same searcher on
 * the same day are deduped via the composite PK + `onConflictDoNothing`, so
 * counting distinct `searcher_hash` over a date window yields unique searchers.
 *
 * `searcher_hash` is a salted SHA-256 of the searcher identity (IP + user
 * agent) — no raw PII is stored.
 */
export const nameSearches = pgTable(
  'name_searches',
  {
    name: text('name').notNull(),
    searcher_hash: text('searcher_hash').notNull(),
    /** Day bucket used for dedupe */
    searched_on: date('searched_on').default(sql`CURRENT_DATE`).notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // Also serves lookups by name (leading column) for the stats query.
    primaryKey({
      columns: [table.name, table.searcher_hash, table.searched_on],
    }),
  ],
)
