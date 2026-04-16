import { describe, expect, it } from 'vitest'
import { CONTRACT_SECONDS_PER_YEAR } from '@/lib/constants/duration'
import {
  getOracleDiscountText,
  getPricingBreakdown,
  getStandardPricePerYear,
  STANDARD_PRICE_PER_YEAR_USD,
} from './registrationPricing'

describe('registrationPricing', () => {
  describe('getStandardPricePerYear', () => {
    it('returns $5 for 5+ character names', () => {
      expect(getStandardPricePerYear('hello')).toBe(STANDARD_PRICE_PER_YEAR_USD)
      expect(getStandardPricePerYear('hello.eth')).toBe(
        STANDARD_PRICE_PER_YEAR_USD,
      )
      expect(getStandardPricePerYear('a')).toBe(STANDARD_PRICE_PER_YEAR_USD)
    })

    it('returns $160 for 4-letter names', () => {
      expect(getStandardPricePerYear('test')).toBe(160)
      expect(getStandardPricePerYear('abcd.eth')).toBe(160)
    })

    it('returns $640 for 3-letter names', () => {
      expect(getStandardPricePerYear('abc')).toBe(640)
      expect(getStandardPricePerYear('xyz.eth')).toBe(640)
    })
  })

  describe('getPricingBreakdown', () => {
    const mockPrice = (baseUsd: number, decimals = 6) => ({
      base: BigInt(Math.round(baseUsd * 10 ** decimals)),
      premium: 0n,
      total: BigInt(Math.round(baseUsd * 10 ** decimals)),
      decimals,
      hasPremium: false,
    })

    it('computes discount as standard - actual', () => {
      // 5-char name: $5/year. 3 years = $15 standard. Actual $12 = $3 discount
      const durationSeconds = 3 * CONTRACT_SECONDS_PER_YEAR
      const result = getPricingBreakdown(
        'hello',
        mockPrice(12),
        durationSeconds,
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
      )
      expect(result.discountAmount).toBe(0)
      expect(result.discountPercent).toBe(0)
    })

    it('includes premiumLabel for 3-4 letter names', () => {
      const durationSeconds = 3 * CONTRACT_SECONDS_PER_YEAR
      const result = getPricingBreakdown(
        'abc',
        mockPrice(1500),
        durationSeconds,
      )
      expect(result.premiumLabel?.label).toBe('3 letter premium price')
      expect(result.pricePerYear).toBe(640)
      expect(result.standardSubtotal).toBe(1920)
    })
  })

  describe('getOracleDiscountText', () => {
    const mockPrice = (baseUsd: number, decimals = 6) => ({
      base: BigInt(Math.round(baseUsd * 10 ** decimals)),
      premium: 0n,
      total: BigInt(Math.round(baseUsd * 10 ** decimals)),
      decimals,
      hasPremium: false,
    })

    // ~$5/year base rate in oracle's 12-decimal per-second units
    const yearlyBaseRate = (5n * 10n ** 12n) / BigInt(CONTRACT_SECONDS_PER_YEAR)

    it('returns undefined when baseRate is 0n', () => {
      expect(
        getOracleDiscountText(0n, mockPrice(9), 2 * CONTRACT_SECONDS_PER_YEAR),
      ).toBeUndefined()
    })

    it('returns undefined for 1-year duration (years < 2)', () => {
      // Even with a discount, years < 2 → no text
      expect(
        getOracleDiscountText(
          yearlyBaseRate,
          mockPrice(4),
          CONTRACT_SECONDS_PER_YEAR,
        ),
      ).toBeUndefined()
    })

    it('returns undefined when actual price >= undiscounted price', () => {
      // actual $10 ≥ undiscounted ~$10 → discountAmount = 0
      expect(
        getOracleDiscountText(
          yearlyBaseRate,
          mockPrice(10),
          2 * CONTRACT_SECONDS_PER_YEAR,
        ),
      ).toBeUndefined()
    })

    it('returns formatted discount text for 2-year registration', () => {
      // undiscounted ~$10 over 2 years, actual $9 → ~10% discount
      const result = getOracleDiscountText(
        yearlyBaseRate,
        mockPrice(9),
        2 * CONTRACT_SECONDS_PER_YEAR,
      )
      expect(result).toMatch(/^2\+ years discount \(\d+%\): -\$/)
    })

    it('returns correct year label for 3-year registration', () => {
      // undiscounted ~$15 over 3 years, actual $12 → ~20% discount
      const result = getOracleDiscountText(
        yearlyBaseRate,
        mockPrice(12),
        3 * CONTRACT_SECONDS_PER_YEAR,
      )
      expect(result).toMatch(/^3\+ years discount \(\d+%\): -\$/)
    })
  })
})
