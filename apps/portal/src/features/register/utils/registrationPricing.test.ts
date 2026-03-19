import { describe, expect, it } from 'vitest'
import {
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
      const result = getPricingBreakdown('hello', mockPrice(12), 3)
      expect(result.standardSubtotal).toBe(15)
      expect(result.actualPrice).toBe(12)
      expect(result.discountAmount).toBe(3)
      expect(result.discountPercent).toBe(20)
    })

    it('returns zero discount when actual >= standard', () => {
      const result = getPricingBreakdown('hello', mockPrice(15), 3)
      expect(result.discountAmount).toBe(0)
      expect(result.discountPercent).toBe(0)
    })

    it('includes premiumLabel for 3-4 letter names', () => {
      const result = getPricingBreakdown('abc', mockPrice(1500), 3)
      expect(result.premiumLabel?.label).toBe('3 letter premium price')
      expect(result.pricePerYear).toBe(640)
      expect(result.standardSubtotal).toBe(1920)
    })
  })
})
