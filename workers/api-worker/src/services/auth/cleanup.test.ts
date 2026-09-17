import { describe, expect, it, vi } from 'vitest'
import type { Database } from '#core/database/index.js'
import { cleanupExpiredAuthAttempts } from './cleanup.js'

describe('cleanupExpiredAuthAttempts', () => {
  it('deletes expired auth attempts and reports the count', async () => {
    const where = vi.fn(() => Promise.resolve({ rowCount: 2 }))
    const db = {
      delete: vi.fn(() => ({ where })),
    } as unknown as Database

    const result = await cleanupExpiredAuthAttempts(db)

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toBe(2)
    expect(db.delete).toHaveBeenCalledTimes(1)
    expect(where).toHaveBeenCalledTimes(1)
  })
})
