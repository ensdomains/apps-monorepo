import { describe, expect, it } from 'vitest'
import {
  MIN_RENEW_DURATION_SECONDS,
  SECONDS_PER_DAY,
} from '@/features/shared/registration/pricing'
import { getMinRenewDurationSeconds } from './renewalDuration'

const NOW = new Date(2026, 9, 25, 14, 30)

const run = (expiry: Date, requireFutureExpiry: boolean) =>
  getMinRenewDurationSeconds({ expiry, now: NOW, requireFutureExpiry })

describe('getMinRenewDurationSeconds', () => {
  it.each([
    ['a live name', new Date(2027, 0, 1)],
    ['a name expiring today', new Date(2026, 9, 25, 8, 0)],
    ['a name expired ten days ago', new Date(2026, 9, 15)],
  ])(
    'asks for a single day for %s when nothing must be restored',
    (_, expiry) => {
      expect(run(expiry, false)).toBe(MIN_RENEW_DURATION_SECONDS)
    },
  )

  it('covers the days since expiry plus one, so the new expiry lands tomorrow', () => {
    expect(run(new Date(2026, 9, 15), true)).toBe(11 * SECONDS_PER_DAY)
  })

  it('asks for a day past a name that expires later today', () => {
    expect(run(new Date(2026, 9, 25, 8, 0), true)).toBe(SECONDS_PER_DAY)
  })

  it('never shortens a live name to less than a day', () => {
    expect(run(new Date(2027, 0, 1), true)).toBe(MIN_RENEW_DURATION_SECONDS)
  })
})
