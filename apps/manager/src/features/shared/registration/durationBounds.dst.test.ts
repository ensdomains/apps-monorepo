import { addDays, addSeconds, startOfDay } from 'date-fns'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  MIN_RENEW_DURATION_SECONDS,
  SECONDS_PER_DAY,
} from '@/features/shared/registration/pricing'

// 2027-03-14 is the US spring-forward. An expiry late on the 13th plus 86400
// seconds lands on the 15th, which would disable the 14th and force two days.
const EXPIRY = new Date('2027-03-14T04:30:00.000Z')

describe('the earliest selectable renewal date', () => {
  const originalTz = process.env.TZ
  beforeAll(() => {
    process.env.TZ = 'America/New_York'
  })
  afterAll(() => {
    process.env.TZ = originalTz
  })

  it('is the day after the expiry even when a DST shift falls inside the span', () => {
    const days = MIN_RENEW_DURATION_SECONDS / SECONDS_PER_DAY
    const bound = addDays(startOfDay(EXPIRY), days)

    expect(bound.getDate()).toBe(EXPIRY.getDate() + 1)
    // The seconds-based form this replaced skipped a day here.
    expect(addSeconds(EXPIRY, MIN_RENEW_DURATION_SECONDS).getDate()).toBe(
      EXPIRY.getDate() + 2,
    )
  })
})
