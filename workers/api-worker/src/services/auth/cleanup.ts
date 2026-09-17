import { lte } from 'drizzle-orm'
import { type Database, intoDbResult, TABLE } from '#core/database/index.js'

export const cleanupExpiredAuthAttempts = (db: Database) =>
  intoDbResult(
    db
      .delete(TABLE.authAttempts)
      .where(lte(TABLE.authAttempts.expires_at, new Date()))
      .returning({ nonce: TABLE.authAttempts.nonce }),
  ).map((deletedAttempts) => deletedAttempts.length)
