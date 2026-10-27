import { lte } from 'drizzle-orm'
import { type Database, intoDbResult, TABLE } from '#core/database/index.js'

export const cleanupExpiredAuthAttempts = (db: Database) =>
  intoDbResult(
    db
      .delete(TABLE.authAttempts)
      .where(lte(TABLE.authAttempts.expires_at, new Date())),
  ).andThen((authResult) =>
    intoDbResult(
      db
        .delete(TABLE.telegramLoginAttempts)
        .where(lte(TABLE.telegramLoginAttempts.expires_at, new Date())),
    ).map(
      (telegramResult) =>
        (authResult.rowCount ?? 0) + (telegramResult.rowCount ?? 0),
    ),
  )
