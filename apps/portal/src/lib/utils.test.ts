import type { Address } from 'viem'
import { zeroAddress } from 'viem'
import { describe, expect, it } from 'vitest'
import { cn, fromCoinType, isZeroAddress } from './utils'

describe('cn', () => {
  it('should merge class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('should handle conditional classes', () => {
    expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz')
    expect(cn('foo', true && 'bar')).toBe('foo bar')
  })

  it('should resolve Tailwind conflicts (tailwind-merge)', () => {
    // Later class should win
    expect(cn('px-2', 'px-4')).toBe('px-4')
    expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500')
  })

  it('should handle empty inputs', () => {
    expect(cn()).toBe('')
    expect(cn('')).toBe('')
  })

  it('should handle arrays', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar')
  })

  it('should handle objects', () => {
    expect(cn({ foo: true, bar: false })).toBe('foo')
  })

  it('should combine multiple input types', () => {
    expect(
      cn('base', { active: true, disabled: false }, ['extra', 'classes']),
    ).toBe('base active extra classes')
  })

  it('should handle complex Tailwind merging scenarios', () => {
    // Responsive classes
    expect(cn('p-2 md:p-4', 'p-6')).toBe('md:p-4 p-6')

    // Hover states
    expect(cn('hover:bg-red-500', 'hover:bg-blue-500')).toBe(
      'hover:bg-blue-500',
    )
  })
})

describe('fromCoinType', () => {
  it('should handle Ethereum mainnet special case (coinType 60 -> chainId 1)', () => {
    expect(fromCoinType(60n)).toBe(1)
  })

  it('should handle raw chain IDs used as coin types (L2 pattern)', () => {
    expect(fromCoinType(10n)).toBe(10) // Optimism
    expect(fromCoinType(42161n)).toBe(42161) // Arbitrum One
    expect(fromCoinType(8453n)).toBe(8453) // Base
    expect(fromCoinType(59144n)).toBe(59144) // Linea
    expect(fromCoinType(534352n)).toBe(534352) // Scroll
  })
})

describe('isZeroAddress', () => {
  it('should return true for zero/null/undefined addresses', () => {
    expect(isZeroAddress(zeroAddress as Address)).toBe(true)
    expect(
      isZeroAddress('0x0000000000000000000000000000000000000000' as Address),
    ).toBe(true)
    expect(isZeroAddress(null)).toBe(true)
    expect(isZeroAddress(undefined)).toBe(true)
  })

  it('should return false for valid non-zero addresses', () => {
    expect(
      isZeroAddress('0x1234567890123456789012345678901234567890' as Address),
    ).toBe(false)
    expect(
      isZeroAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as Address),
    ).toBe(false)
  })
})
