import { describe, expect, it } from 'vitest'
import { instantToTimeValue, mergeTimeIntoInstant } from './dateTimeInput'

describe('dateTimeInput', () => {
  describe('instantToTimeValue', () => {
    it('formats instant with zero-padded hours and minutes in local time', () => {
      // Use an ISO string without Z so it's treated as local time
      const instant = Temporal.Instant.from('2025-01-15T09:05:00Z')
      const result = instantToTimeValue(instant)
      expect(result).toMatch(/^\d{2}:\d{2}$/)
    })

    it('formats midnight UTC as HH:MM', () => {
      const instant = Temporal.Instant.from('2025-01-15T00:00:00Z')
      const result = instantToTimeValue(instant)
      expect(result).toMatch(/^\d{2}:\d{2}$/)
    })
  })

  describe('mergeTimeIntoInstant', () => {
    it('merges time string into instant preserving calendar date in local time', () => {
      const base = Temporal.Instant.from('2025-03-18T10:00:00Z')
      const result = mergeTimeIntoInstant(base, '14:30')
      const zdt = result.toZonedDateTimeISO(Temporal.Now.timeZoneId())
      expect(zdt.hour).toBe(14)
      expect(zdt.minute).toBe(30)
      expect(zdt.second).toBe(0)
    })

    it('handles invalid time string by defaulting to 00:00', () => {
      const base = Temporal.Instant.from('2025-03-18T14:30:00Z')
      const result = mergeTimeIntoInstant(base, 'invalid')
      const zdt = result.toZonedDateTimeISO(Temporal.Now.timeZoneId())
      expect(zdt.hour).toBe(0)
      expect(zdt.minute).toBe(0)
    })

    it('handles empty string by defaulting to 00:00', () => {
      const base = Temporal.Instant.from('2025-03-18T14:30:00Z')
      const result = mergeTimeIntoInstant(base, '')
      const zdt = result.toZonedDateTimeISO(Temporal.Now.timeZoneId())
      expect(zdt.hour).toBe(0)
      expect(zdt.minute).toBe(0)
    })
  })
})
