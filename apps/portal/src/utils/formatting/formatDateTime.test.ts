import { describe, expect, it } from 'vitest'
import {
  formatDateTime,
  formatDottedDateTimeLocal,
  formatExpiryDate,
  formatExpiryDateTimeLocal,
} from './formatDateTime'

describe('formatDottedDateTimeLocal', () => {
  it('formats an instant as "YYYY.MM.DD at HH:MM"', () => {
    const instant = Temporal.Instant.from('2026-05-08T02:44:00Z')
    expect(formatDottedDateTimeLocal(instant)).toMatch(
      /^\d{4}\.\d{2}\.\d{2} at \d{2}:\d{2}$/,
    )
  })
})

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
