import { describe, expect, it } from 'vitest'
import { formatExtensionPeriod } from './formatExtensionPeriod'

const period = (from: string, to: string) =>
  formatExtensionPeriod(
    Temporal.PlainDate.from(from),
    Temporal.PlainDate.from(to),
  )

describe('formatExtensionPeriod', () => {
  it('distinguishes a day past a whole-year target from the target itself', () => {
    // Both printed "1 year" before: seconds ÷ 365.25 d absorbed the extra day.
    expect(period('2033-08-06', '2034-08-06')).toBe('1 year')
    expect(period('2033-08-06', '2034-08-07')).toBe('1 year 1 day')
  })

  it('formats years, months and days', () => {
    expect(period('2030-01-01', '2033-03-03')).toBe('3 years 2 months 2 days')
    expect(period('2030-01-01', '2030-02-02')).toBe('1 month 1 day')
  })

  it('treats a leap-day expiry constrained to Feb 28 as a whole year', () => {
    expect(period('2028-02-29', '2029-02-28')).toBe('1 year')
  })
})
