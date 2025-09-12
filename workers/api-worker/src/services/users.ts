import type { Address } from 'viem'
import { type Database, intoDbResult } from '@/database'
import { users } from '@/database/schema'

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
