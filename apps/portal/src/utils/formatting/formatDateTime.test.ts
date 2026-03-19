import { describe, expect, it } from 'vitest'
import {
  formatDateTime,
  formatExpiryDate,
  formatExpiryDateTimeLocal,
} from './formatDateTime'

describe('formatDateTime', () => {
  it('should format date with long month name', () => {
    const date = new Date('2025-01-15T12:30:45Z')

    const result = formatDateTime(date)

    expect(result).toBeDefined()
    expect(result).toMatch(/January/)
    expect(result).toMatch(/15/)
    expect(result).toMatch(/2025/)
  })

  it('should format different months correctly', () => {
    const date = new Date('2025-06-15T14:30:45Z')

    const result = formatDateTime(date)

    expect(result).toBeDefined()
    expect(result).toMatch(/June/)
    expect(result).toMatch(/15/)
    expect(result).toMatch(/2025/)
  })
})

describe('formatExpiryDate', () => {
  it('should format as short date (MMM DD, YYYY)', () => {
    const date = new Date('2029-02-17')

    const result = formatExpiryDate(date)

    expect(result).toBe('Feb 17, 2029')
  })

  it('should format January correctly', () => {
    const date = new Date('2025-01-01')

    const result = formatExpiryDate(date)

    expect(result).toBe('Jan 1, 2025')
  })

  it('should format December correctly', () => {
    const date = new Date('2030-12-25')

    const result = formatExpiryDate(date)

    expect(result).toBe('Dec 25, 2030')
  })
})

describe('formatExpiryDateTimeLocal', () => {
  it('should include date and time', () => {
    const date = new Date('2029-02-17T10:30:00Z')

    const result = formatExpiryDateTimeLocal(date)

    expect(result).toMatch(/Feb/)
    expect(result).toMatch(/17/)
    expect(result).toMatch(/2029/)
    expect(result).toMatch(/\d{1,2}:\d{2}\s*(AM|PM)/)
  })

  it('should use short month format', () => {
    const date = new Date('2025-06-15T14:00:00Z')

    const result = formatExpiryDateTimeLocal(date)

    expect(result).toMatch(/Jun/)
    expect(result).toMatch(/15/)
    expect(result).toMatch(/2025/)
  })
})
