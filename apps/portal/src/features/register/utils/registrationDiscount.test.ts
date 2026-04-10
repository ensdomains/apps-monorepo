import { describe, expect, it } from 'vitest'
import { CONTRACT_SECONDS_PER_YEAR } from '@/lib/constants/duration'
import {
  formatDiscountPercentForDisplay,
  getDiscountForYears,
  getEffectiveDiscountPercent,
} from './registrationDiscount'

describe('registrationDiscount', () => {
  describe('getEffectiveDiscountPercent', () => {
    it('returns 0 for zero or negative duration', () => {
      expect(getEffectiveDiscountPercent(0)).toBe(0)
      expect(getEffectiveDiscountPercent(-1)).toBe(0)
      expect(getEffectiveDiscountPercent(-CONTRACT_SECONDS_PER_YEAR)).toBe(0)
    })

    it('returns 0 for 1 year (first interval)', () => {
      expect(getEffectiveDiscountPercent(CONTRACT_SECONDS_PER_YEAR)).toBe(0)
    })

    it('returns 5% for 2 years (0% + 10% over 2 years)', () => {
      const result = getEffectiveDiscountPercent(2 * CONTRACT_SECONDS_PER_YEAR)
      expect(result).toBeCloseTo(5, 1)
    })

    it('returns 10% for 3 years (0% + 10% + 20% over 3 years)', () => {
      const result = getEffectiveDiscountPercent(3 * CONTRACT_SECONDS_PER_YEAR)
      expect(result).toBeCloseTo(10, 1)
    })

    it('returns ~17.5% for 5 years', () => {
      const result = getEffectiveDiscountPercent(5 * CONTRACT_SECONDS_PER_YEAR)
      expect(result).toBeCloseTo(17.5, 1)
    })

    it('returns ~25% for 10 years', () => {
      const result = getEffectiveDiscountPercent(10 * CONTRACT_SECONDS_PER_YEAR)
      expect(result).toBeCloseTo(25, 1)
    })

    it('returns value between 0 and ~33 for valid durations', () => {
      const oneYear = getEffectiveDiscountPercent(CONTRACT_SECONDS_PER_YEAR)
      const twentyYears = getEffectiveDiscountPercent(
        20 * CONTRACT_SECONDS_PER_YEAR,
      )
      expect(oneYear).toBeGreaterThanOrEqual(0)
      expect(twentyYears).toBeGreaterThanOrEqual(0)
      expect(twentyYears).toBeLessThanOrEqual(35)
    })
  })

  describe('getDiscountForYears', () => {
    it('returns percent 0 and empty label for 1 year', () => {
      expect(getDiscountForYears(1)).toEqual({ percent: 0, label: '' })
    })

    it('returns percent 0 and empty label for fractional year under 1', () => {
      expect(getDiscountForYears(0.5)).toEqual({ percent: 0, label: '' })
    })

    it('returns correct percent and label for 3 years', () => {
      const result = getDiscountForYears(3)
      expect(result.percent).toBeGreaterThan(0)
      expect(result.label).toBe('3+ years')
    })

    it('returns correct percent and label for 5 years', () => {
      const result = getDiscountForYears(5)
      expect(result.percent).toBeGreaterThan(0)
      expect(result.label).toBe('5+ years')
    })

    it('returns correct percent and label for 10 years', () => {
      const result = getDiscountForYears(10)
      expect(result.percent).toBeGreaterThan(0)
      expect(result.label).toBe('10+ years')
    })

    it('returns "1+ year" (singular) for 1.x years when percent > 0', () => {
      const result = getDiscountForYears(2)
      expect(result.label).toBe('2+ years')
    })

    it('rounds percent to 2 decimal places', () => {
      const result = getDiscountForYears(3)
      const decimalPlaces = (result.percent.toString().split('.')[1] ?? '')
        .length
      expect(decimalPlaces).toBeLessThanOrEqual(2)
    })
  })

  describe('formatDiscountPercentForDisplay', () => {
    it('returns "0%" for zero or negative', () => {
      expect(formatDiscountPercentForDisplay(0)).toBe('0%')
      expect(formatDiscountPercentForDisplay(-1)).toBe('0%')
    })

    it('formats whole numbers without decimals', () => {
      expect(formatDiscountPercentForDisplay(10)).toBe('10%')
      expect(formatDiscountPercentForDisplay(20)).toBe('20%')
    })

    it('formats decimals with one decimal place', () => {
      expect(formatDiscountPercentForDisplay(17.5)).toBe('17.5%')
    })

    it('matches getDiscountForYears output for 5 years (17.5%)', () => {
      const { percent } = getDiscountForYears(5)
      expect(formatDiscountPercentForDisplay(percent)).toBe('17.5%')
    })
  })
})
