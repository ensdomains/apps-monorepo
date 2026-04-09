import { describe, expect, it } from 'vitest'
import { CONTRACT_SECONDS_PER_YEAR } from '@/lib/constants/duration'
import {
  getBaseRateUsdForLength,
  getPricePerYearUsd,
  getPricingBreakdown,
} from './registrationPricing'

const BASE_RATES = [640, 160, 20, 5, 5] // 1-char → 5+-char

describe('getBaseRateUsdForLength', () => {
  it('returns rate for exact length', () => {
    expect(getBaseRateUsdForLength(BASE_RATES, 3)).toBe(20)
  })

  it('clamps to last rate for names longer than array', () => {
    expect(getBaseRateUsdForLength(BASE_RATES, 10)).toBe(5)
  })

  it('clamps to first rate for length 1', () => {
    expect(getBaseRateUsdForLength(BASE_RATES, 1)).toBe(640)
  })

  it('returns 0 for empty array', () => {
    expect(getBaseRateUsdForLength([], 5)).toBe(0)
  })
})

const mockOracleData = {
  baseRatesUsd: BASE_RATES,
  discountPoints: [],
  premiumDecay: { startPriceUsd: 0, halvingPeriodMs: 0, periodMs: 0 },
}

describe('getPricePerYearUsd', () => {
  it('returns undefined when oracleData is undefined', () => {
    expect(getPricePerYearUsd(undefined, 'hello')).toBeUndefined()
  })

  it('returns correct rate for a valid name', () => {
    expect(getPricePerYearUsd(mockOracleData, 'hello')).toBe(5) // 5-char → last rate
    expect(getPricePerYearUsd(mockOracleData, 'abc')).toBe(20) // 3-char
  })

  it('returns undefined for an invalid name', () => {
    expect(getPricePerYearUsd(mockOracleData, '')).toBeUndefined()
  })
})

describe('registrationPricing', () => {
  const mockPrice = (baseUsd: number, decimals = 6) => ({
    base: BigInt(Math.round(baseUsd * 10 ** decimals)),
    premium: 0n,
    total: BigInt(Math.round(baseUsd * 10 ** decimals)),
    decimals,
    hasPremium: false,
  })

  describe('getPricingBreakdown', () => {
    it('computes discount as standard - actual', () => {
      // 5-char name: oracle says $5/year. 3 years = $15 standard. Actual $12 = $3 discount
      const durationSeconds = 3 * CONTRACT_SECONDS_PER_YEAR
      const result = getPricingBreakdown(
        'hello',
        mockPrice(12),
        durationSeconds,
        5,
      )
      expect(result.years).toBe(3)
      expect(result.standardSubtotal).toBe(15)
      expect(result.actualPrice).toBe(12)
      expect(result.discountAmount).toBe(3)
      expect(result.discountPercent).toBe(20)
    })

    it('returns zero discount when actual >= standard', () => {
      const durationSeconds = 3 * CONTRACT_SECONDS_PER_YEAR
      const result = getPricingBreakdown(
        'hello',
        mockPrice(15),
        durationSeconds,
        5,
      )
      expect(result.discountAmount).toBe(0)
      expect(result.discountPercent).toBe(0)
    })

    it('returns zero subtotal and discount when pricePerYearUsd is undefined', () => {
      const durationSeconds = 3 * CONTRACT_SECONDS_PER_YEAR
      const result = getPricingBreakdown(
        'hello',
        mockPrice(12),
        durationSeconds,
        undefined,
      )
      expect(result.pricePerYear).toBe(0)
      expect(result.standardSubtotal).toBe(0)
      expect(result.discountAmount).toBe(0)
      expect(result.discountPercent).toBe(0)
      // actualPrice still computed correctly from oracle price
      expect(result.actualPrice).toBe(12)
    })

    it('sets discountLabel for multi-year registrations', () => {
      const result = getPricingBreakdown(
        'hello',
        mockPrice(12),
        3 * CONTRACT_SECONDS_PER_YEAR,
        5,
      )
      expect(result.discountLabel).toBe('3+ years')
    })

    it('uses Math.floor for discountLabel (2.5 years → "2+ years")', () => {
      const result = getPricingBreakdown(
        'hello',
        mockPrice(10),
        2.5 * CONTRACT_SECONDS_PER_YEAR,
        5,
      )
      expect(result.discountLabel).toBe('2+ years')
    })

    it('sets empty discountLabel for 1-year registrations', () => {
      const result = getPricingBreakdown(
        'hello',
        mockPrice(5),
        CONTRACT_SECONDS_PER_YEAR,
        5,
      )
      expect(result.discountLabel).toBe('')
    })

    it('includes premiumLabel for 3-4 letter names', () => {
      const durationSeconds = 3 * CONTRACT_SECONDS_PER_YEAR
      const result = getPricingBreakdown(
        'abc',
        mockPrice(1500),
        durationSeconds,
        640,
      )
      expect(result.premiumLabel?.label).toBe('3 letter premium price')
      expect(result.pricePerYear).toBe(640)
      expect(result.standardSubtotal).toBe(1920)
    })
  })
})
