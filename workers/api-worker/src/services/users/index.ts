import type { Address } from 'viem'
import { type Database, intoDbResult } from '#core/database/index.js'
import { users } from '#core/database/schema/index.js'
import { eq } from 'drizzle-orm'
import { ResultFn } from '@ens-apps/utils/neverthrow'
import { ok } from 'neverthrow'

export const addUserIfNotExists = ResultFn(async function* (db: Database, address: Address) {
  const existingUser = yield* intoDbResult(db.query.users.findFirst({
    where: eq(users.address, address),
  }))

  if (existingUser) {
    return ok(existingUser)
  }

  return intoDbResult(
    db
      .insert(users)
      .values({
        address,
      })
      .returning()
      .then((result) => result[0]),
  )
})
