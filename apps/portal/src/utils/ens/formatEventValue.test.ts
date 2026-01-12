import { describe, expect, it } from 'vitest'
import { formatEventValue } from './formatEventValue'

describe('formatEventValue', () => {
  describe('null and undefined handling', () => {
    it('should return "-" for null', () => {
      expect(formatEventValue('any', null)).toBe('-')
    })

    it('should return "-" for undefined', () => {
      expect(formatEventValue('any', undefined)).toBe('-')
    })
  })

  describe('date/timestamp formatting', () => {
    it('should format Unix timestamp for fields with "date" in the name', () => {
      const timestamp = 1704067200n // 2024-01-01 00:00:00 UTC
      const result = formatEventValue('expiryDate', timestamp)

      // Should contain date and time parts
      expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/)
      expect(result).toMatch(/\d{2}:\d{2}:\d{2}/)
    })

    it('should format timestamp for fields with "expiry" in the name', () => {
      const timestamp = 1735689600 // 2025-01-01 00:00:00 UTC
      const result = formatEventValue('expiry', timestamp)

      expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/)
      expect(result).toMatch(/\d{2}:\d{2}:\d{2}/)
    })

    it('should be case-insensitive for date detection', () => {
      const timestamp = 1704067200

      expect(formatEventValue('ExpiryDate', timestamp)).toMatch(
        /\d{2}\/\d{2}\/\d{4}/,
      )
      expect(formatEventValue('EXPIRY_DATE', timestamp)).toMatch(
        /\d{2}\/\d{2}\/\d{4}/,
      )
      expect(formatEventValue('creation_date', timestamp)).toMatch(
        /\d{2}\/\d{2}\/\d{4}/,
      )
    })

    it('should handle bigint timestamps', () => {
      const timestamp = 1704067200n
      const result = formatEventValue('expiryDate', timestamp)

      expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/)
    })

    it('should handle string timestamps', () => {
      const timestamp = '1704067200'
      const result = formatEventValue('expiryDate', timestamp)

      expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/)
    })

    it('should handle number timestamps', () => {
      const timestamp = 1704067200
      const result = formatEventValue('expiryDate', timestamp)

      expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/)
    })

    it('should NOT format small numbers that are not Unix timestamps', () => {
      // Numbers less than 1_000_000_000 are not treated as timestamps
      expect(formatEventValue('expiryDate', 999999999)).toBe('999999999')
      expect(formatEventValue('date', 12345)).toBe('12345')
    })

    it('should only format Unix timestamps (not milliseconds)', () => {
      // Unix timestamp in seconds (> 1_000_000_000)
      const timestampSeconds = 1704067200
      const resultSeconds = formatEventValue('date', timestampSeconds)
      expect(resultSeconds).toMatch(/\d{2}\/\d{2}\/\d{4}/)

      // If someone passes milliseconds, it would be way larger but still work
      const timestampMs = 1704067200000
      const resultMs = formatEventValue('date', timestampMs)
      expect(resultMs).toMatch(/\d{2}\/\d{2}\/\d{4}/)
    })
  })

  describe('non-date field handling', () => {
    it('should return string representation for regular fields', () => {
      expect(formatEventValue('owner', '0x1234')).toBe('0x1234')
      expect(formatEventValue('name', 'vitalik.eth')).toBe('vitalik.eth')
    })

    it('should convert numbers to strings for non-date fields', () => {
      expect(formatEventValue('count', 42)).toBe('42')
      expect(formatEventValue('value', 1000000000)).toBe('1000000000')
    })

    it('should convert bigint to strings for non-date fields', () => {
      expect(formatEventValue('balance', 123456789n)).toBe('123456789')
    })

    it('should handle boolean values', () => {
      expect(formatEventValue('isActive', true)).toBe('true')
      expect(formatEventValue('isAuthorized', false)).toBe('false')
    })

    it('should handle objects', () => {
      const obj = { foo: 'bar' }
      expect(formatEventValue('data', obj)).toBe('[object Object]')
    })

    it('should handle arrays', () => {
      expect(formatEventValue('items', [1, 2, 3])).toBe('1,2,3')
    })
  })

  describe('edge cases', () => {
    it('should handle empty string', () => {
      expect(formatEventValue('name', '')).toBe('')
    })

    it('should handle zero', () => {
      expect(formatEventValue('count', 0)).toBe('0')
    })

    it('should handle NaN', () => {
      expect(formatEventValue('value', Number.NaN)).toBe('NaN')
    })

    it('should handle Infinity', () => {
      expect(formatEventValue('value', Number.POSITIVE_INFINITY)).toBe(
        'Infinity',
      )
    })
  })
})
