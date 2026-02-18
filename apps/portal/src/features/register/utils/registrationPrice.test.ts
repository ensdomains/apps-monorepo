import { describe, expect, it } from 'vitest'
import { isPriceResult } from './registrationPrice'

const validPriceResult = {
  base: '$5.00',
  premium: '$0.00',
  total: '$5.00',
  totalRaw: 5_000_000n,
  hasPremium: false,
}

describe('isPriceResult', () => {
  it('returns true for valid RegistrationPriceResult', () => {
    expect(isPriceResult(validPriceResult)).toBe(true)
  })

  it('returns true for object with extra fields', () => {
    expect(isPriceResult({ ...validPriceResult, extra: 'ignored' })).toBe(true)
  })

  it('returns false for null', () => {
    expect(isPriceResult(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isPriceResult(undefined)).toBe(false)
  })

  it('returns false for primitives', () => {
    expect(isPriceResult('string')).toBe(false)
    expect(isPriceResult(123)).toBe(false)
    expect(isPriceResult(true)).toBe(false)
  })

  it('returns false when base is missing', () => {
    const { base: _, ...withoutBase } = validPriceResult
    expect(isPriceResult(withoutBase)).toBe(false)
  })

  it('returns false when total is missing', () => {
    const { total: _, ...withoutTotal } = validPriceResult
    expect(isPriceResult(withoutTotal)).toBe(false)
  })

  it('returns false when totalRaw is missing', () => {
    const { totalRaw: _, ...withoutTotalRaw } = validPriceResult
    expect(isPriceResult(withoutTotalRaw)).toBe(false)
  })
})
