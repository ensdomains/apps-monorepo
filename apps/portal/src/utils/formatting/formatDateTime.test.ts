import { describe, expect, it } from 'vitest'
import {
  formatDateTime,
  formatExpiryDate,
  formatExpiryDateTimeLocal,
  formatExpiryDuration,
} from './formatDateTime'

describe('formatDateTime', () => {
  it('should format date with long month name', () => {
    const date = Temporal.PlainDate.from('2025-01-15')
    const result = formatDateTime(date)
    expect(result).toBeDefined()
    expect(result).toMatch(/January/)
    expect(result).toMatch(/15/)
    expect(result).toMatch(/2025/)
  })

  it('should format different months correctly', () => {
    const date = Temporal.PlainDate.from('2025-06-15')
    const result = formatDateTime(date)
    expect(result).toBeDefined()
    expect(result).toMatch(/June/)
    expect(result).toMatch(/15/)
    expect(result).toMatch(/2025/)
  })
})

describe('formatExpiryDate', () => {
  it('should format as short date (MMM DD, YYYY)', () => {
    const date = Temporal.PlainDate.from('2029-02-17')
    const result = formatExpiryDate(date)
    expect(result).toBe('Feb 17, 2029')
  })

  it('should format January correctly', () => {
    const date = Temporal.PlainDate.from('2025-01-01')
    const result = formatExpiryDate(date)
    expect(result).toBe('Jan 1, 2025')
  })

  it('should format December correctly', () => {
    const date = Temporal.PlainDate.from('2030-12-25')
    const result = formatExpiryDate(date)
    expect(result).toBe('Dec 25, 2030')
  })
})

describe('formatExpiryDuration', () => {
  const today = Temporal.PlainDate.from('2026-01-01')

  it('should format years and leftover days', () => {
    const expiry = Temporal.PlainDate.from('2027-05-04')
    expect(formatExpiryDuration(expiry, today)).toBe('1 year 123 days')
  })

  it('should pluralize years', () => {
    const expiry = Temporal.PlainDate.from('2028-01-11')
    expect(formatExpiryDuration(expiry, today)).toBe('2 years 10 days')
  })

  it('should omit days for a whole number of years', () => {
    const expiry = Temporal.PlainDate.from('2029-01-01')
    expect(formatExpiryDuration(expiry, today)).toBe('3 years')
  })

  it('should show only days when under a year', () => {
    const expiry = Temporal.PlainDate.from('2026-02-15')
    expect(formatExpiryDuration(expiry, today)).toBe('45 days')
  })

  it('should singularize a single day', () => {
    const expiry = Temporal.PlainDate.from('2026-01-02')
    expect(formatExpiryDuration(expiry, today)).toBe('1 day')
  })

  it('should return "Expired" for past or same-day dates', () => {
    expect(
      formatExpiryDuration(Temporal.PlainDate.from('2025-12-31'), today),
    ).toBe('Expired')
    expect(formatExpiryDuration(today, today)).toBe('Expired')
  })
})

describe('formatExpiryDateTimeLocal', () => {
  it('should include date and time', () => {
    const instant = Temporal.Instant.from('2029-02-17T10:30:00Z')
    const result = formatExpiryDateTimeLocal(instant)
    expect(result).toMatch(/Feb/)
    expect(result).toMatch(/17/)
    expect(result).toMatch(/2029/)
    expect(result).toMatch(/\d{1,2}:\d{2}\s*(AM|PM)/)
  })

  it('should use short month format', () => {
    const instant = Temporal.Instant.from('2025-06-15T14:00:00Z')
    const result = formatExpiryDateTimeLocal(instant)
    expect(result).toMatch(/Jun/)
    expect(result).toMatch(/15/)
    expect(result).toMatch(/2025/)
  })
})
