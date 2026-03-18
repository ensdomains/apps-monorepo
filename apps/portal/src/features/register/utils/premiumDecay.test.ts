import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getDateForPremiumPrice,
  getPremiumDatesFromPrice,
  getPremiumDatesFromRegistrationPrice,
  getPremiumPriceAtDate,
  PREMIUM_PERIOD_MS,
} from './premiumDecay'

const MS_PER_DAY = 24 * 60 * 60 * 1000

describe('premiumDecay', () => {
  describe('getPremiumPriceAtDate', () => {
    it('returns start price when target is before premium start', () => {
      const premiumStart = new Date('2025-01-01T00:00:00')
      const target = new Date('2024-12-31T23:59:59')
      expect(getPremiumPriceAtDate(premiumStart, target)).toBe(
        100_000_000 - 47.6837158203125,
      )
    })

    it('returns 0 when target is at or after premium end', () => {
      const premiumStart = new Date('2025-01-01T00:00:00')
      const premiumEnd = new Date(premiumStart.getTime() + PREMIUM_PERIOD_MS)
      expect(getPremiumPriceAtDate(premiumStart, premiumEnd)).toBe(0)
      expect(
        getPremiumPriceAtDate(
          premiumStart,
          new Date(premiumEnd.getTime() + 1000),
        ),
      ).toBe(0)
    })

    it('reduces price after one day', () => {
      const premiumStart = new Date('2025-01-01T00:00:00')
      const oneDayLater = new Date(premiumStart.getTime() + MS_PER_DAY)
      const price = getPremiumPriceAtDate(premiumStart, oneDayLater)
      const startPrice = getPremiumPriceAtDate(premiumStart, premiumStart)
      expect(price).toBeLessThan(startPrice)
      expect(price).toBeGreaterThan(0)
    })

    it('returns decreasing price as time progresses', () => {
      const premiumStart = new Date('2025-01-01T00:00:00')
      const startPrice = getPremiumPriceAtDate(premiumStart, premiumStart)
      const day1 = getPremiumPriceAtDate(
        premiumStart,
        new Date(premiumStart.getTime() + MS_PER_DAY),
      )
      const day10 = getPremiumPriceAtDate(
        premiumStart,
        new Date(premiumStart.getTime() + 10 * MS_PER_DAY),
      )
      expect(day1).toBeLessThan(startPrice)
      expect(day10).toBeLessThan(day1)
    })
  })

  describe('getDateForPremiumPrice', () => {
    it('returns premium start when target price is at or above start', () => {
      const premiumStart = new Date('2025-01-01T00:00:00')
      const result = getDateForPremiumPrice(
        premiumStart,
        100_000_000 - 47.6837158203125,
      )
      expect(result.getTime()).toBe(premiumStart.getTime())
    })

    it('returns premium end when target price is 0 or below', () => {
      const premiumStart = new Date('2025-01-01T00:00:00')
      const premiumEnd = new Date(premiumStart.getTime() + PREMIUM_PERIOD_MS)
      expect(getDateForPremiumPrice(premiumStart, 0).getTime()).toBe(
        premiumEnd.getTime(),
      )
    })

    it('is inverse of getPremiumPriceAtDate', () => {
      const premiumStart = new Date('2025-01-01T00:00:00')
      const targetDate = new Date(premiumStart.getTime() + 5 * MS_PER_DAY)
      const price = getPremiumPriceAtDate(premiumStart, targetDate)
      const recoveredDate = getDateForPremiumPrice(premiumStart, price)
      expect(recoveredDate.getTime()).toBeCloseTo(targetDate.getTime(), -2)
    })
  })

  describe('getPremiumDatesFromPrice', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2025-03-18T12:00:00'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns null for zero or negative premium', () => {
      expect(getPremiumDatesFromPrice(0)).toBeNull()
      expect(getPremiumDatesFromPrice(-100)).toBeNull()
    })

    it('returns premium start and end dates', () => {
      const result = getPremiumDatesFromPrice(50_000_000)
      expect(result).not.toBeNull()
      expect(result?.premiumStartDate).toBeInstanceOf(Date)
      expect(result?.premiumEndDate).toBeInstanceOf(Date)
      expect(result).not.toBeNull()
      if (result) {
        expect(
          result.premiumEndDate.getTime() - result.premiumStartDate.getTime(),
        ).toBe(PREMIUM_PERIOD_MS)
      }
    })

    it('premium end is 21 days after premium start', () => {
      const result = getPremiumDatesFromPrice(1_000_000)
      expect(result).not.toBeNull()
      if (result) {
        const diff =
          result.premiumEndDate.getTime() - result.premiumStartDate.getTime()
        expect(diff).toBe(PREMIUM_PERIOD_MS)
      }
    })
  })

  describe('getPremiumDatesFromRegistrationPrice', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2025-03-18T12:00:00'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns null when hasPremium is false', () => {
      expect(
        getPremiumDatesFromRegistrationPrice({
          premium: 1000000n,
          decimals: 6,
          hasPremium: false,
        }),
      ).toBeNull()
    })

    it('converts premium from token units to USD and returns dates', () => {
      const result = getPremiumDatesFromRegistrationPrice({
        premium: 50_000_000_000_000n,
        decimals: 6,
        hasPremium: true,
      })
      expect(result).not.toBeNull()
      expect(result?.premiumStartDate).toBeInstanceOf(Date)
      expect(result?.premiumEndDate).toBeInstanceOf(Date)
    })
  })
})
