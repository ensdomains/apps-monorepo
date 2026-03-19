import { describe, expect, it } from 'vitest'
import { DAI_DECIMALS, USDC_DECIMALS } from '@/lib/constants/tokens'
import {
  formatPriceDisplay,
  formatRegistrationTotal,
  isPriceResult,
} from './registrationPrice'

const validPriceResult = {
  base: 5_000_000n,
  premium: 0n,
  total: 5_000_000n,
  decimals: USDC_DECIMALS,
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

  it('returns false when decimals is missing', () => {
    const { decimals: _, ...withoutDecimals } = validPriceResult
    expect(isPriceResult(withoutDecimals)).toBe(false)
  })

  it('returns false when hasPremium is missing', () => {
    const { hasPremium: _, ...withoutHasPremium } = validPriceResult
    expect(isPriceResult(withoutHasPremium)).toBe(false)
  })

  it('returns false when total is wrong type (string instead of bigint)', () => {
    expect(isPriceResult({ ...validPriceResult, total: '5000000' })).toBe(false)
  })

  it('returns false when base is wrong type', () => {
    expect(isPriceResult({ ...validPriceResult, base: 5 })).toBe(false)
  })

  it('returns false when premium is wrong type', () => {
    expect(isPriceResult({ ...validPriceResult, premium: '0' })).toBe(false)
  })

  it('returns false when decimals is wrong type', () => {
    expect(isPriceResult({ ...validPriceResult, decimals: '6' })).toBe(false)
  })

  it('returns false when hasPremium is wrong type', () => {
    expect(isPriceResult({ ...validPriceResult, hasPremium: 'false' })).toBe(
      false,
    )
  })
})

describe('formatRegistrationTotal', () => {
  it('formats base + premium as USD total', () => {
    const base = 5_000_000n // 5 USDC
    const premium = 0n
    const result = formatRegistrationTotal(base, premium)
    expect(result).toBe('$5.00')
  })

  it('rounds total to nearest dollar', () => {
    const base = 3_840_001_000n // 3840.001 USDC
    const premium = 0n
    const result = formatRegistrationTotal(base, premium)
    expect(result).toBe('$3,840.00')
  })

  it('uses default decimals (USDC) when not specified', () => {
    const base = 10_000_000n
    const premium = 0n
    const result = formatRegistrationTotal(base, premium)
    expect(result).toBe('$10.00')
  })

  it('accepts custom decimals for DAI', () => {
    const base = 5_000_000_000_000_000_000n // 5 DAI
    const premium = 0n
    const result = formatRegistrationTotal(base, premium, DAI_DECIMALS)
    expect(result).toBe('$5.00')
  })

  it('handles base and premium', () => {
    const base = 5_000_000n
    const premium = 0n
    const result = formatRegistrationTotal(base, premium)
    expect(result).toBe('$5.00')
  })

  it('handles zero base and premium', () => {
    const result = formatRegistrationTotal(0n, 0n)
    expect(result).toBe('$0.00')
  })
})

describe('formatPriceDisplay', () => {
  it('formats raw amount with given decimals', () => {
    expect(formatPriceDisplay(5_000_000n, 6)).toBe('$5.00')
    expect(formatPriceDisplay(5_000_000_000_000_000_000n, 18)).toBe('$5.00')
  })
})
