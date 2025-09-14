import type { Address } from 'viem'
import { type Database, intoDbResult } from '@/core/database'
import { users } from '@/core/database/schema/index'

export const addUserIfNotExists = (db: Database, address: Address) => {
  return intoDbResult(
    db
      .insert(users)
      .values({
        address,
      })
      .onConflictDoNothing(),
  )
}
