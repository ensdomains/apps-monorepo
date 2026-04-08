import { describe, expect, it } from 'vitest'
import { CONTRACT_SECONDS_PER_YEAR } from '@/lib/constants/duration'
import { getPricingBreakdown } from './registrationPricing'

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
