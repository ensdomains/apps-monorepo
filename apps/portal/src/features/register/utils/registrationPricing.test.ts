import { describe, expect, it } from 'vitest'
import { CONTRACT_SECONDS_PER_YEAR } from '@/lib/constants/duration'
import { getOracleDiscountText } from './registrationPricing'

describe('registrationPricing', () => {
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
