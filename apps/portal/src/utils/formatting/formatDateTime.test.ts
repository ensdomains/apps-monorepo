import { describe, expect, it } from 'vitest'
import { formatDateTime } from './formatDateTime'

describe('formatDateTime', () => {
  it('should format date with long month name', () => {
    const date = new Date('2025-01-15T12:30:45Z')

    const result = formatDateTime(date)

    expect(result).toBeDefined()
    // Should contain full month name, day, and year
    expect(result).toMatch(/January/)
    expect(result).toMatch(/15/)
    expect(result).toMatch(/2025/)
  })

  it('should return undefined for undefined input', () => {
    const result = formatDateTime(undefined)

    expect(result).toBeUndefined()
  })

  it('should return undefined for null input', () => {
    const result = formatDateTime(null)

    expect(result).toBeUndefined()
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
