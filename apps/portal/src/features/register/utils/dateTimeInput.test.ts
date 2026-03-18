import { describe, expect, it } from 'vitest'
import { dateToTimeValue, mergeTimeIntoDate } from './dateTimeInput'

describe('dateTimeInput', () => {
  describe('dateToTimeValue', () => {
    it('formats date with zero-padded hours and minutes', () => {
      expect(dateToTimeValue(new Date('2025-01-15T09:05:00'))).toBe('09:05')
    })

    it('formats midnight as 00:00', () => {
      expect(dateToTimeValue(new Date('2025-01-15T00:00:00'))).toBe('00:00')
    })

    it('formats noon as 12:00', () => {
      expect(dateToTimeValue(new Date('2025-01-15T12:00:00'))).toBe('12:00')
    })

    it('formats end of day as 23:59', () => {
      expect(dateToTimeValue(new Date('2025-01-15T23:59:00'))).toBe('23:59')
    })
  })

  describe('mergeTimeIntoDate', () => {
    it('merges time string into date preserving date part', () => {
      const base = new Date('2025-03-18T10:00:00')
      const result = mergeTimeIntoDate(base, '14:30')
      expect(result.getFullYear()).toBe(2025)
      expect(result.getMonth()).toBe(2)
      expect(result.getDate()).toBe(18)
      expect(result.getHours()).toBe(14)
      expect(result.getMinutes()).toBe(30)
      expect(result.getSeconds()).toBe(0)
    })

    it('handles midnight', () => {
      const base = new Date('2025-03-18T14:30:00')
      const result = mergeTimeIntoDate(base, '00:00')
      expect(result.getHours()).toBe(0)
      expect(result.getMinutes()).toBe(0)
    })

    it('handles invalid time string by defaulting to 0', () => {
      const base = new Date('2025-03-18T14:30:00')
      const result = mergeTimeIntoDate(base, 'invalid')
      expect(result.getHours()).toBe(0)
      expect(result.getMinutes()).toBe(0)
    })

    it('handles empty string', () => {
      const base = new Date('2025-03-18T14:30:00')
      const result = mergeTimeIntoDate(base, '')
      expect(result.getHours()).toBe(0)
      expect(result.getMinutes()).toBe(0)
    })
  })
})
