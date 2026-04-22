import { describe, expect, it } from 'vitest'
import { CONTRACT_SECONDS_PER_YEAR } from '@/lib/constants/duration'
import { computeNamePricingDisplay } from './computeNamePricingDisplay'

const USDC_DECIMALS = 6

const mockPrice = (
  baseUsd: number,
  premiumUsd = 0,
  decimals = USDC_DECIMALS,
) => ({
  base: BigInt(Math.round(baseUsd * 10 ** decimals)),
  premium: BigInt(Math.round(premiumUsd * 10 ** decimals)),
  total: BigInt(Math.round((baseUsd + premiumUsd) * 10 ** decimals)),
  decimals,
  hasPremium: premiumUsd > 0,
})

const selectedName = (
  name: string,
  expiryDate?: Date | null,
  isV2 = false,
) => ({ name, expiryDate, isV2 })

const ONE_YEAR = CONTRACT_SECONDS_PER_YEAR
const THREE_YEARS = 3 * CONTRACT_SECONDS_PER_YEAR

describe('computeNamePricingDisplay', () => {
  describe('registrationPeriod', () => {
    it('returns a non-empty string for 1 year', () => {
      const result = computeNamePricingDisplay(
        selectedName('hello.eth'),
        mockPrice(5),
        ONE_YEAR,
      )
      expect(result.registrationPeriod).toBeTruthy()
      expect(typeof result.registrationPeriod).toBe('string')
    })
  })

  describe('newExpiryFormatted', () => {
    it('adds duration days to the existing expiry date', () => {
      const expiryDate = new Date('2024-01-01T00:00:00Z')
      const result = computeNamePricingDisplay(
        selectedName('hello.eth', expiryDate),
        mockPrice(5),
        ONE_YEAR,
      )
      // CONTRACT_SECONDS_PER_YEAR floors to 365 days; 2024 is a leap year so Jan 1 + 365 = Dec 31
      expect(result.newExpiryFormatted).toBe('Dec 31, 2024')
    })

    it('adds duration days from today when no expiry date', () => {
      const result = computeNamePricingDisplay(
        selectedName('hello.eth', null),
        mockPrice(5),
        ONE_YEAR,
      )
      // Just verify it's a date string — exact value depends on today
      expect(result.newExpiryFormatted).toMatch(
        /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/,
      )
    })
  })

  describe('priceLabel', () => {
    it('returns "Price:" when there is no discount', () => {
      // 5-char name: $5/year standard. 1 year actual = $5 → no discount
      const result = computeNamePricingDisplay(
        selectedName('hello.eth'),
        mockPrice(5),
        ONE_YEAR,
      )
      expect(result.priceLabel).toBe('Price:')
    })

    it('includes discount percentage when there is a discount', () => {
      // 5-char name: $5/year. 3 years standard = $15. Actual $12 → 20% off
      const result = computeNamePricingDisplay(
        selectedName('hello.eth'),
        mockPrice(12),
        THREE_YEARS,
      )
      expect(result.priceLabel).toBe('Price (20% discount):')
    })
  })

  describe('priceValue', () => {
    it('shows $/year × N for multi-year durations', () => {
      const result = computeNamePricingDisplay(
        selectedName('hello.eth'),
        mockPrice(15),
        THREE_YEARS,
      )
      // 5-char name: $5/year
      expect(result.priceValue).toBe('$5.00/year × 3')
    })

    it('shows just the price without × N for sub-year durations', () => {
      const sixMonths = Math.floor(ONE_YEAR / 2)
      const result = computeNamePricingDisplay(
        selectedName('hello.eth'),
        mockPrice(2.5),
        sixMonths,
      )
      // Sub-year: no "/year × N" — just the formatted price
      expect(result.priceValue).toBe('$5.00')
      expect(result.priceValue).not.toContain('×')
    })
  })

  describe('subtotal', () => {
    it('formats base price as USD', () => {
      const result = computeNamePricingDisplay(
        selectedName('hello.eth'),
        mockPrice(5),
        ONE_YEAR,
      )
      expect(result.subtotal).toBe('$5.00')
    })

    it('does not include premium in subtotal', () => {
      const result = computeNamePricingDisplay(
        selectedName('hello.eth'),
        mockPrice(5, 100),
        ONE_YEAR,
      )
      expect(result.subtotal).toBe('$5.00')
    })
  })

  describe('total', () => {
    it('equals subtotal when there is no premium', () => {
      const result = computeNamePricingDisplay(
        selectedName('hello.eth'),
        mockPrice(5),
        ONE_YEAR,
      )
      expect(result.total).toBe(result.subtotal)
    })

    it('includes premium when present', () => {
      const result = computeNamePricingDisplay(
        selectedName('hello.eth'),
        mockPrice(5, 100),
        ONE_YEAR,
      )
      expect(result.total).toBe('$105.00')
    })
  })

  describe('actualPrice', () => {
    it('returns base as a plain number for totalling', () => {
      const result = computeNamePricingDisplay(
        selectedName('hello.eth'),
        mockPrice(5),
        ONE_YEAR,
      )
      expect(result.actualPrice).toBeCloseTo(5, 2)
    })

    it('does not include premium', () => {
      const result = computeNamePricingDisplay(
        selectedName('hello.eth'),
        mockPrice(5, 100),
        ONE_YEAR,
      )
      expect(result.actualPrice).toBeCloseTo(5, 2)
    })
  })

  describe('3-letter names', () => {
    it('uses $640/year as the standard price', () => {
      // 3-char, 1 year, actual = $640 → no discount. 1yr hits the >= 12 month
      // threshold so format is "$640.00/year × 1"
      const result = computeNamePricingDisplay(
        selectedName('abc.eth'),
        mockPrice(640),
        ONE_YEAR,
      )
      expect(result.priceLabel).toBe('Price:')
      expect(result.priceValue).toBe('$640.00/year × 1')
    })

    it('shows discount against $640/year standard for multi-year', () => {
      // 3-char, 3 years standard = $1920. Actual $1500 → ~21.9% off
      const result = computeNamePricingDisplay(
        selectedName('abc.eth'),
        mockPrice(1500),
        THREE_YEARS,
      )
      expect(result.priceLabel).toMatch(/Price \(\d+% discount\):/)
      expect(result.priceValue).toContain('/year × 3')
    })
  })
})
