import { describe, expect, it } from 'vitest'
import { formatDate, getDateRangeLabel } from './formatDateRange'

describe('formatDateRange', () => {
  describe('formatDate', () => {
    it('should format date to locale string with slashes', () => {
      const date = new Date('2021-01-15T00:00:00Z')

      const result = formatDate(date)

      expect(result).toBeDefined()
      expect(result).toContain('/')
      expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/)
    })

    it('should return undefined for undefined input', () => {
      const result = formatDate(undefined)

      expect(result).toBeUndefined()
    })

    it('should format with 2-digit month and day', () => {
      const date = new Date('2021-03-05T00:00:00Z')

      const result = formatDate(date)

      expect(result).toBeDefined()
      // Should have proper padding for single digit months/days
      expect(result?.split('/').every((part) => part.length >= 2)).toBe(true)
    })

    it('should not contain hyphens in output', () => {
      const date = new Date('2021-01-15T00:00:00Z')

      const result = formatDate(date)

      expect(result).not.toContain('-')
    })

    it('should handle dates at year boundaries', () => {
      const newYearsDay = new Date('2021-01-01T00:00:00Z')
      const newYearsEve = new Date('2021-12-31T23:59:59Z')

      const result1 = formatDate(newYearsDay)
      const result2 = formatDate(newYearsEve)

      expect(result1).toBeDefined()
      expect(result2).toBeDefined()
    })
  })

  describe('getDateRangeLabel', () => {
    it('should return "All" when no dates are provided', () => {
      const result = getDateRangeLabel({})

      expect(result).toBe('All')
    })

    it('should return "All" when both dates are undefined', () => {
      const result = getDateRangeLabel({ from: undefined, to: undefined })

      expect(result).toBe('All')
    })

    it('should return "From DATE" when only from date is provided', () => {
      const from = new Date('2021-01-15T00:00:00Z')

      const result = getDateRangeLabel({ from })

      expect(result).toMatch(/^From \d{2}\/\d{2}\/\d{4}$/)
      expect(result).toContain('From')
    })

    it('should return "Until DATE" when only to date is provided', () => {
      const to = new Date('2021-12-31T00:00:00Z')

      const result = getDateRangeLabel({ to })

      expect(result).toMatch(/^Until \d{2}\/\d{2}\/\d{4}$/)
      expect(result).toContain('Until')
    })

    it('should return date range with hyphen when both dates are provided', () => {
      const from = new Date('2021-01-01T00:00:00Z')
      const to = new Date('2021-12-31T00:00:00Z')

      const result = getDateRangeLabel({ from, to })

      expect(result).toMatch(/\d{2}\/\d{2}\/\d{4} - \d{2}\/\d{2}\/\d{4}/)
      expect(result).toContain(' - ')
    })

    it('should prioritize both dates over single date', () => {
      const from = new Date('2021-01-01T00:00:00Z')
      const to = new Date('2021-12-31T00:00:00Z')

      const result = getDateRangeLabel({ from, to })

      expect(result).not.toContain('From')
      expect(result).not.toContain('Until')
      expect(result).toContain(' - ')
    })

    it('should handle same from and to date', () => {
      const sameDate = new Date('2021-06-15T00:00:00Z')

      const result = getDateRangeLabel({ from: sameDate, to: sameDate })

      expect(result).toContain(' - ')
      // Should show the same date twice
      const parts = result.split(' - ')
      expect(parts).toHaveLength(2)
    })
  })
})
