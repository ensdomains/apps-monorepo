import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import {
  durationSearchSchema,
  getDurationPrefillSeconds,
} from './durationSearch'
import { getDurationInSecondsFromYears } from './time'

describe('duration route search', () => {
  it('prefills an exact 69-day registration and resulting expiry', () => {
    const search = v.parse(durationSearchSchema, { durationDays: '69' })
    const seconds = getDurationPrefillSeconds(search)

    expect(search.durationDays).toBe(69)
    expect(seconds).toBe(69 * 86_400)
    expect(
      new Date(Date.UTC(2030, 0, 1) + (seconds ?? 0) * 1000).toISOString(),
    ).toBe('2030-03-11T00:00:00.000Z')
  })

  it('uses the current on-chain expiry when pre-filling two renewal years', () => {
    const expiryDate = new Date('2028-02-29T00:00:00.000Z')
    const search = v.parse(durationSearchSchema, { durationYears: 2 })

    expect(getDurationPrefillSeconds(search, expiryDate)).toBe(
      getDurationInSecondsFromYears(2, expiryDate),
    )
  })

  it('leaves direct routes on their normal default without a prefill', () => {
    expect(
      getDurationPrefillSeconds(v.parse(durationSearchSchema, {})),
    ).toBeUndefined()
  })

  it.each([
    { durationDays: 27 },
    { durationDays: 69.5 },
    { durationDays: -69 },
    { durationDays: 36_526 },
    { durationYears: 0 },
    { durationYears: 101 },
    { durationDays: 69, durationYears: 2 },
    { durationYears: '2e3' },
  ])('rejects an invalid or conflicting duration: %o', (search) => {
    expect(v.safeParse(durationSearchSchema, search).success).toBe(false)
  })
})
