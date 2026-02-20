import { describe, expect, it, vi } from 'vitest'
import {
  calculateDurationFromDate,
  calculateExpirationDate,
  createEmptyPricingQuoteMap,
  formatDuration,
  formatExpirationDate,
  getByteLength,
  getInitialPricingOptions,
  INITIAL_PRICING_OPTIONS,
  sanitizePricingDuration,
} from './utils'

describe('Pricing utils', () => {
  it('returns initial options with discounts when enabled', () => {
    expect(getInitialPricingOptions(true)).toEqual(INITIAL_PRICING_OPTIONS)
  })

  it('strips discounts when disabled', () => {
    const options = getInitialPricingOptions(false)

    expect(options[1].discount).toBe(0)
    expect(options[3].discount).toBe(0)
    expect(options[5].discount).toBe(0)
    expect(options[10].discount).toBe(0)
  })

  it('normalizes duration to supported values', () => {
    expect(sanitizePricingDuration(undefined)).toBe(1)
    expect(sanitizePricingDuration(NaN)).toBe(1)
    expect(sanitizePricingDuration(0)).toBe(1)
    expect(sanitizePricingDuration(2)).toBe(1)
    expect(sanitizePricingDuration(4)).toBe(1)
    expect(sanitizePricingDuration(5)).toBe(5)
    expect(sanitizePricingDuration(11)).toBe(10)
    expect(sanitizePricingDuration(3.6)).toBe(1)
  })

  it('builds an empty pricing quote map', () => {
    expect(createEmptyPricingQuoteMap()).toEqual({
      1: {},
      3: {},
      5: {},
      10: {},
    })
  })

  it('formats durations with two digits', () => {
    expect(formatDuration(1)).toBe('01')
    expect(formatDuration(10)).toBe('10')
  })

  it('formats expiration dates in US locale', () => {
    expect(
      formatExpirationDate(new Date('2024-03-15T00:00:00.000Z')).toString(),
    ).toMatch(/March/)
  })

  it('calculates byte length with UTF-8 encoding', () => {
    expect(getByteLength('hello')).toBe(5)
    expect(getByteLength('hello🔥')).toBe(9)
  })

  it('calculates expiration date from years', () => {
    vi.useFakeTimers()
    const baseDate = new Date('2024-03-15T00:00:00.000Z')
    vi.setSystemTime(baseDate)

    const expiration = calculateExpirationDate(2)

    expect(expiration.getUTCFullYear()).toBe(2026)
    vi.useRealTimers()
  })

  it('calculates remaining duration from date and rounds up', () => {
    const start = new Date('2024-01-01T00:00:00.000Z')
    const target = new Date(start)
    target.setUTCFullYear(2026)
    target.setUTCDate(target.getUTCDate() + 1)

    vi.useFakeTimers()
    vi.setSystemTime(start)

    expect(calculateDurationFromDate(target)).toBe(3)

    vi.useRealTimers()
  })
})
