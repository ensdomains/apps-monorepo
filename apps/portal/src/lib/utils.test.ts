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
  it('should return 1 for Ethereum mainnet (coinType 60)', () => {
    expect(fromCoinType(60n)).toBe(1)
  })

  it('should convert valid coin types to chain IDs', () => {
    expect(fromCoinType(0n)).toBe(0)
    expect(fromCoinType(1n)).toBe(1)
    expect(fromCoinType(137n)).toBe(137) // Polygon
    expect(fromCoinType(10n)).toBe(10) // Optimism
  })

  it('should handle large valid coin types', () => {
    const maxValid = 0x7fffffffn // Max 31-bit value
    expect(fromCoinType(maxValid)).toBe(Number(maxValid))
  })

  it('should handle zero coin type', () => {
    expect(fromCoinType(0n)).toBe(0)
  })

  it('should mask the MSB correctly (extract lower 31 bits)', () => {
    // The function masks with 0x7fffffff to get the lower 31 bits
    // So 0x80000005 & 0x7fffffff = 0x00000005 = 5
    const coinTypeWithMSB = 0x80000005n
    expect(fromCoinType(coinTypeWithMSB)).toBe(5)
  })

  it('should handle coin types with MSB set by masking', () => {
    // 0x80000000 & 0x7fffffff = 0
    expect(fromCoinType(0x80000000n)).toBe(0)

    // 0x80000001 & 0x7fffffff = 1
    expect(fromCoinType(0x80000001n)).toBe(1)

    // 0xFFFFFFFF & 0x7fffffff = 0x7fffffff
    expect(fromCoinType(0xffffffffn)).toBe(0x7fffffff)
  })

  it('should handle very large coin types by masking to valid range', () => {
    // Any large number gets masked to 31-bit range
    const hugeCoinType = 0x123456789abcdefn
    const expected = Number(hugeCoinType & 0x7fffffffn)
    expect(fromCoinType(hugeCoinType)).toBe(expected)
  })
})

describe('isZeroAddress', () => {
  it('should return true for zero address', () => {
    expect(isZeroAddress(zeroAddress as Address)).toBe(true)
  })

  it('should return true for null', () => {
    expect(isZeroAddress(null)).toBe(true)
  })

  it('should return true for undefined', () => {
    expect(isZeroAddress(undefined)).toBe(true)
  })

  it('should return false for valid non-zero address', () => {
    const validAddress = '0x1234567890123456789012345678901234567890' as Address
    expect(isZeroAddress(validAddress)).toBe(false)
  })

  it('should return false for typical Ethereum addresses', () => {
    expect(
      isZeroAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as Address),
    ).toBe(false)
    expect(
      isZeroAddress('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address),
    ).toBe(false)
  })

  it('should return true for explicit zero address string', () => {
    expect(
      isZeroAddress('0x0000000000000000000000000000000000000000' as Address),
    ).toBe(true)
  })

  it('should handle empty string as falsy', () => {
    expect(isZeroAddress('' as Address)).toBe(true)
  })
})
