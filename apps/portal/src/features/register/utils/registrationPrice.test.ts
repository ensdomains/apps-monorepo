import { describe, expect, it } from 'vitest'
import { DAI_DECIMALS, USDC_DECIMALS } from '@/lib/constants/tokens'
import {
  formatPriceDisplay,
  formatTotalWithGasAndFees,
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
})

describe('formatTotalWithGasAndFees', () => {
  it('adds gas and fees to totalRaw and formats as USD', () => {
    const totalRaw = 5_000_000n // 5 USDC (USDC_DECIMALS)
    const result = formatTotalWithGasAndFees(totalRaw, 0.1)
    expect(result).toBe('$5.10')
  })

  it('uses default decimals (USDC) when not specified', () => {
    const totalRaw = 10_000_000n // 10 USDC
    const result = formatTotalWithGasAndFees(totalRaw, 0.05)
    expect(result).toBe('$10.05')
  })

  it('accepts custom decimals for DAI', () => {
    const totalRaw = 5_000_000_000_000_000_000n // 5 DAI (DAI_DECIMALS)
    const result = formatTotalWithGasAndFees(totalRaw, 0.1, DAI_DECIMALS)
    expect(result).toBe('$5.10')
  })

  it('rounds gas and fees to nearest token unit', () => {
    const totalRaw = 5_000_000n // 5 USDC
    const result = formatTotalWithGasAndFees(totalRaw, 0.101, USDC_DECIMALS)
    expect(result).toBe('$5.10')
  })

  it('handles zero gas and fees', () => {
    const totalRaw = 5_000_000n
    const result = formatTotalWithGasAndFees(totalRaw, 0)
    expect(result).toBe('$5.00')
  })

  it('handles zero totalRaw', () => {
    const result = formatTotalWithGasAndFees(0n, 0.1)
    expect(result).toBe('$0.10')
  })
})

describe('formatPriceDisplay', () => {
  it('formats raw amount with given decimals', () => {
    expect(formatPriceDisplay(5_000_000n, 6)).toBe('$5.00')
    expect(formatPriceDisplay(5_000_000_000_000_000_000n, 18)).toBe('$5.00')
  })
})
