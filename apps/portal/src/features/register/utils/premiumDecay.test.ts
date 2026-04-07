import { describe, expect, it } from 'vitest'
import {
  getInstantForPremiumPrice,
  getPremiumInstantRange,
  getPremiumInstantRangeFromPrice,
  getPremiumPriceAtInstant,
  PREMIUM_PERIOD_MS,
} from './premiumDecay'

const MS_PER_DAY = 24 * 60 * 60 * 1000

describe('premiumDecay', () => {
  describe('getPremiumPriceAtInstant', () => {
    it('returns start price when target is before premium start', () => {
      const premiumStart = Temporal.Instant.from('2025-01-01T00:00:00Z')
      const target = Temporal.Instant.fromEpochMilliseconds(
        premiumStart.epochMilliseconds - 1000,
      )
      expect(getPremiumPriceAtInstant(premiumStart, target)).toBe(
        100_000_000 - 47.6837158203125,
      )
    })

    it('returns 0 when target is at or after premium end', () => {
      const premiumStart = Temporal.Instant.from('2025-01-01T00:00:00Z')
      const premiumEnd = Temporal.Instant.fromEpochMilliseconds(
        premiumStart.epochMilliseconds + PREMIUM_PERIOD_MS,
      )
      expect(getPremiumPriceAtInstant(premiumStart, premiumEnd)).toBe(0)
      expect(
        getPremiumPriceAtInstant(
          premiumStart,
          Temporal.Instant.fromEpochMilliseconds(
            premiumEnd.epochMilliseconds + 1000,
          ),
        ),
      ).toBe(0)
    })

    it('reduces price after one day', () => {
      const premiumStart = Temporal.Instant.from('2025-01-01T00:00:00Z')
      const oneDayLater = Temporal.Instant.fromEpochMilliseconds(
        premiumStart.epochMilliseconds + MS_PER_DAY,
      )
      const price = getPremiumPriceAtInstant(premiumStart, oneDayLater)
      const startPrice = getPremiumPriceAtInstant(premiumStart, premiumStart)
      expect(price).toBeLessThan(startPrice)
      expect(price).toBeGreaterThan(0)
    })

    it('returns decreasing price as time progresses', () => {
      const premiumStart = Temporal.Instant.from('2025-01-01T00:00:00Z')
      const startPrice = getPremiumPriceAtInstant(premiumStart, premiumStart)
      const day1 = getPremiumPriceAtInstant(
        premiumStart,
        Temporal.Instant.fromEpochMilliseconds(
          premiumStart.epochMilliseconds + MS_PER_DAY,
        ),
      )
      const day10 = getPremiumPriceAtInstant(
        premiumStart,
        Temporal.Instant.fromEpochMilliseconds(
          premiumStart.epochMilliseconds + 10 * MS_PER_DAY,
        ),
      )
      expect(day1).toBeLessThan(startPrice)
      expect(day10).toBeLessThan(day1)
    })
  })

  describe('getInstantForPremiumPrice', () => {
    it('returns premium start when target price is at or above start', () => {
      const premiumStart = Temporal.Instant.from('2025-01-01T00:00:00Z')
      const result = getInstantForPremiumPrice(
        premiumStart,
        100_000_000 - 47.6837158203125,
      )
      expect(result.epochMilliseconds).toBe(premiumStart.epochMilliseconds)
    })

    it('returns premium end when target price is 0 or below', () => {
      const premiumStart = Temporal.Instant.from('2025-01-01T00:00:00Z')
      const premiumEnd = Temporal.Instant.fromEpochMilliseconds(
        premiumStart.epochMilliseconds + PREMIUM_PERIOD_MS,
      )
      expect(getInstantForPremiumPrice(premiumStart, 0).epochMilliseconds).toBe(
        premiumEnd.epochMilliseconds,
      )
    })

    it('is inverse of getPremiumPriceAtInstant', () => {
      const premiumStart = Temporal.Instant.from('2025-01-01T00:00:00Z')
      const targetInstant = Temporal.Instant.fromEpochMilliseconds(
        premiumStart.epochMilliseconds + 5 * MS_PER_DAY,
      )
      const price = getPremiumPriceAtInstant(premiumStart, targetInstant)
      const recovered = getInstantForPremiumPrice(premiumStart, price)
      expect(recovered.epochMilliseconds).toBeCloseTo(
        targetInstant.epochMilliseconds,
        -2,
      )
    })

    it('clamps inverted price target within premium window', () => {
      const premiumStart = Temporal.Instant.from('2025-01-01T00:00:00Z')
      const premiumEnd = Temporal.Instant.fromEpochMilliseconds(
        premiumStart.epochMilliseconds + PREMIUM_PERIOD_MS,
      )
      expect(
        getInstantForPremiumPrice(premiumStart, -1).epochMilliseconds,
      ).toBe(premiumEnd.epochMilliseconds)
      expect(
        getInstantForPremiumPrice(premiumStart, Number.MAX_SAFE_INTEGER)
          .epochMilliseconds,
      ).toBe(premiumStart.epochMilliseconds)
    })
  })

  describe('getPremiumInstantRange', () => {
    it('returns null for zero or negative premium', () => {
      expect(getPremiumInstantRange(0)).toBeNull()
      expect(getPremiumInstantRange(-1)).toBeNull()
    })

    it('returns start and end instants with 21-day spread', () => {
      const result = getPremiumInstantRange(50_000_000)
      expect(result).not.toBeNull()
      if (result) {
        expect(
          result.end.epochMilliseconds - result.start.epochMilliseconds,
        ).toBe(PREMIUM_PERIOD_MS)
      }
    })

    it('premium end is 21 days after premium start', () => {
      const result = getPremiumInstantRange(1_000_000)
      expect(result).not.toBeNull()
      if (result) {
        const diff =
          result.end.epochMilliseconds - result.start.epochMilliseconds
        expect(diff).toBe(PREMIUM_PERIOD_MS)
      }
    })
  })

  describe('getPremiumInstantRangeFromPrice', () => {
    it('returns null when hasPremium is false', () => {
      expect(
        getPremiumInstantRangeFromPrice({
          premium: 1000000n,
          decimals: 6,
          hasPremium: false,
        }),
      ).toBeNull()
    })

    it('converts premium from token units to USD and returns instant range', () => {
      const result = getPremiumInstantRangeFromPrice({
        premium: 50_000_000_000_000n,
        decimals: 6,
        hasPremium: true,
      })
      expect(result).not.toBeNull()
      if (result) {
        expect(result.start).toBeInstanceOf(Temporal.Instant)
        expect(result.end).toBeInstanceOf(Temporal.Instant)
        expect(
          result.end.epochMilliseconds - result.start.epochMilliseconds,
        ).toBe(PREMIUM_PERIOD_MS)
      }
    })
  })
})
