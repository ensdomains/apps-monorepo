import { describe, expect, it } from 'vitest'
import { getDurationInSecondsFromYears } from '@/features/register/utils/registrationDuration'
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

const selectedName = (name: string, expiryDate?: Date | null, isV2 = false) =>
  ({ name, expiryDate, isV2 }) as const

const ONE_YEAR = CONTRACT_SECONDS_PER_YEAR
const THREE_YEARS = 3 * CONTRACT_SECONDS_PER_YEAR

/** Builds a per-second oracle base rate (12 decimals) from a $/year amount */
const baseRateForUsdPerYear = (usdPerYear: number): bigint =>
  (BigInt(usdPerYear) * 10n ** 12n) / BigInt(CONTRACT_SECONDS_PER_YEAR)

describe('computeNamePricingDisplay', () => {
  describe('registrationPeriod', () => {
    it('returns a non-empty string for 1 year', () => {
      const result = computeNamePricingDisplay(
        selectedName('hello.eth'),
        mockPrice(5),
        ONE_YEAR,
        0n,
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
        0n,
      )
      // CONTRACT_SECONDS_PER_YEAR floors to 365 days; 2024 is a leap year so Jan 1 + 365 = Dec 31
      expect(result.newExpiryFormatted).toBe('Dec 31, 2024')
    })

    it('adds duration days from today when no expiry date', () => {
      const result = computeNamePricingDisplay(
        selectedName('hello.eth', null),
        mockPrice(5),
        ONE_YEAR,
        0n,
      )
      // Just verify it's a date string — exact value depends on today
      expect(result.newExpiryFormatted).toMatch(
        /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/,
      )
    })
  })

  describe('priceLabel', () => {
    it('always returns "Price:" — discount is surfaced via discountSublabel', () => {
      const result = computeNamePricingDisplay(
        selectedName('hello.eth'),
        mockPrice(5),
        ONE_YEAR,
        0n,
      )
      expect(result.priceLabel).toBe('Price:')
    })
  })

  describe('discountSublabel', () => {
    it('is undefined for 1-year durations', () => {
      const result = computeNamePricingDisplay(
        selectedName('hello.eth'),
        mockPrice(5),
        ONE_YEAR,
        0n,
      )
      expect(result.discountSublabel).toBeUndefined()
    })

    it('shows "X+ yr discount price" for multi-year durations', () => {
      const result = computeNamePricingDisplay(
        selectedName('hello.eth'),
        mockPrice(12),
        THREE_YEARS,
        0n,
      )
      expect(result.discountSublabel).toBe('3+ yr discount price')
    })
  })

  describe('priceValue', () => {
    it('derives $/year from actual base / years for multi-year durations', () => {
      // base $15 over 3 years → $5/year
      const result = computeNamePricingDisplay(
        selectedName('hello.eth'),
        mockPrice(15),
        THREE_YEARS,
        0n,
      )
      expect(result.priceValue).toBe('$5.00/year')
      expect(result.priceValue).not.toContain('×')
    })

    it('quotes a 1-year term at the same figure as its total', () => {
      // Aug 2027 -> Aug 2028 crosses Feb 29, so the term is 366 days = 1.002
      // contract years. Dividing by that printed a per-year rate a cent under
      // the total sitting right next to it.
      const expiryDate = new Date(2027, 7, 12)
      const duration = getDurationInSecondsFromYears(
        1,
        Temporal.PlainDate.from('2027-08-12'),
      )
      const rate = 254000000n
      const base = (rate * BigInt(duration)) / 1000000n

      const result = computeNamePricingDisplay(
        selectedName('hello.eth', expiryDate),
        {
          base,
          premium: 0n,
          total: base,
          decimals: USDC_DECIMALS,
          hasPremium: false,
        },
        duration,
        rate,
      )

      expect(result.registrationPeriod).toBe('1 year')
      expect(result.priceValue).toBe(`${result.total}/year`)
    })

    it('marks the rate approximate: rounding it back out misses the total', () => {
      // $27.0198 over 6 years is $4.5033/year, which prints as $4.50 — and
      // $4.50 × 6 reads as $27.00, two cents under what is charged.
      const result = computeNamePricingDisplay(
        selectedName('hello.eth'),
        mockPrice(27.0198),
        6 * CONTRACT_SECONDS_PER_YEAR,
        0n,
      )

      expect(result.priceValue).toBe('≈ $4.50/year')
      expect(result.total).toBe('$27.02')
    })

    it('shows actual base for 1-year durations', () => {
      // base $8 over 1 year → $8/year
      const result = computeNamePricingDisplay(
        selectedName('hello.eth'),
        mockPrice(8),
        ONE_YEAR,
        0n,
      )
      expect(result.priceValue).toBe('$8.00/year')
    })
  })

  describe('label accuracy', () => {
    it('does not claim a tier the term has not reached', () => {
      // 5 years 11 months: rounds to 6, but only 5 whole years are bought.
      const almostSix = 6 * CONTRACT_SECONDS_PER_YEAR - 30 * 86400

      expect(
        computeNamePricingDisplay(
          selectedName('hello.eth'),
          mockPrice(27),
          almostSix,
          0n,
        ).discountSublabel,
      ).toBe('5+ yr discount price')
    })

    it('marks the rate approximate only when it cannot reconcile', () => {
      const exact = computeNamePricingDisplay(
        selectedName('hello.eth'),
        mockPrice(27),
        6 * CONTRACT_SECONDS_PER_YEAR,
        0n,
      )
      const rounded = computeNamePricingDisplay(
        selectedName('hello.eth'),
        mockPrice(27.0198),
        6 * CONTRACT_SECONDS_PER_YEAR,
        0n,
      )

      expect(exact.priceValue).toBe('$4.50/year')
      expect(exact.total).toBe('$27.00')
      expect(rounded.priceValue).toBe('≈ $4.50/year')
      expect(rounded.total).toBe('$27.02')
    })
  })

  describe('subtotal', () => {
    it('formats base price as USD', () => {
      const result = computeNamePricingDisplay(
        selectedName('hello.eth'),
        mockPrice(5),
        ONE_YEAR,
        0n,
      )
      expect(result.subtotal).toBe('$5.00')
    })

    it('does not include premium in subtotal', () => {
      const result = computeNamePricingDisplay(
        selectedName('hello.eth'),
        mockPrice(5, 100),
        ONE_YEAR,
        0n,
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
        0n,
      )
      expect(result.total).toBe(result.subtotal)
    })

    it('includes premium when present', () => {
      const result = computeNamePricingDisplay(
        selectedName('hello.eth'),
        mockPrice(5, 100),
        ONE_YEAR,
        0n,
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
        0n,
      )
      expect(result.actualPrice).toBeCloseTo(5, 2)
    })

    it('does not include premium', () => {
      const result = computeNamePricingDisplay(
        selectedName('hello.eth'),
        mockPrice(5, 100),
        ONE_YEAR,
        0n,
      )
      expect(result.actualPrice).toBeCloseTo(5, 2)
    })
  })

  describe('discountAmount', () => {
    it('is 0 when baseRate is 0n (oracle data not loaded)', () => {
      const result = computeNamePricingDisplay(
        selectedName('hello.eth'),
        mockPrice(12),
        THREE_YEARS,
        0n,
      )
      expect(result.discountAmount).toBe(0)
    })

    it('derives discount from baseRate × duration vs actual base', () => {
      // Oracle says $8/yr undiscounted. Actual paid $15 over 3 years → $24 - $15 = $9 discount.
      const result = computeNamePricingDisplay(
        selectedName('hello.eth'),
        mockPrice(15),
        THREE_YEARS,
        baseRateForUsdPerYear(8),
      )
      expect(result.discountAmount).toBeCloseTo(9, 1)
    })

    it('is 0 when actual >= undiscounted', () => {
      const result = computeNamePricingDisplay(
        selectedName('hello.eth'),
        mockPrice(24),
        THREE_YEARS,
        baseRateForUsdPerYear(8),
      )
      expect(result.discountAmount).toBe(0)
    })
  })
})
