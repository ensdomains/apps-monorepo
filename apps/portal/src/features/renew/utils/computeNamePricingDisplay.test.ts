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
    it('always returns "Price:" — discount is surfaced via discountSublabel', () => {
      const noDiscount = computeNamePricingDisplay(
        selectedName('hello.eth'),
        mockPrice(5),
        ONE_YEAR,
      )
      expect(noDiscount.priceLabel).toBe('Price:')

      const withDiscount = computeNamePricingDisplay(
        selectedName('hello.eth'),
        mockPrice(12),
        THREE_YEARS,
      )
      expect(withDiscount.priceLabel).toBe('Price:')
    })
  })

  describe('discountSublabel', () => {
    it('is undefined for 1-year durations', () => {
      const result = computeNamePricingDisplay(
        selectedName('hello.eth'),
        mockPrice(5),
        ONE_YEAR,
      )
      expect(result.discountSublabel).toBeUndefined()
    })

    it('shows "X+ yr discount price" for multi-year durations', () => {
      const result = computeNamePricingDisplay(
        selectedName('hello.eth'),
        mockPrice(12),
        THREE_YEARS,
      )
      expect(result.discountSublabel).toBe('3+ yr discount price')
    })
  })

  describe('priceValue', () => {
    it('shows curve-derived $/year for multi-year durations', () => {
      // 5+ char baseline $8/yr, 3-year discount avg 31.25% → $5.50/year
      const result = computeNamePricingDisplay(
        selectedName('hello.eth'),
        mockPrice(15),
        THREE_YEARS,
      )
      expect(result.priceValue).toBe('$5.50/year')
      expect(result.priceValue).not.toContain('×')
    })

    it('shows the baseline $/year for 1-year durations', () => {
      // 5+ char baseline $8/yr, 1-year discount 0% → $8.00/year
      const result = computeNamePricingDisplay(
        selectedName('hello.eth'),
        mockPrice(8),
        ONE_YEAR,
      )
      expect(result.priceValue).toBe('$8.00/year')
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
    it('shows $640/year (no discount) for 1-year', () => {
      const result = computeNamePricingDisplay(
        selectedName('abc.eth'),
        mockPrice(640),
        ONE_YEAR,
      )
      expect(result.priceLabel).toBe('Price:')
      expect(result.priceValue).toBe('$640.00/year')
    })

    it('shows curve-derived $/year + discount sublabel for multi-year', () => {
      // 3-letter baseline $640/yr, 3-year discount 31.25% → $440/year
      const result = computeNamePricingDisplay(
        selectedName('abc.eth'),
        mockPrice(1500),
        THREE_YEARS,
      )
      expect(result.priceLabel).toBe('Price:')
      expect(result.priceValue).toBe('$440.00/year')
      expect(result.discountSublabel).toBe('3+ yr discount price')
    })
  })
})
