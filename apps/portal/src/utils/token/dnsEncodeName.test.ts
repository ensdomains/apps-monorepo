import { describe, expect, it } from 'vitest'
import { dnsEncodeName, encodeLabelhash } from './dnsEncodeName'

describe('dnsEncodeName', () => {
  it('should encode simple domain name', () => {
    const result = dnsEncodeName('vitalik.eth')
    expect(result).toBeTypeOf('string')
    expect(result.startsWith('0x')).toBe(true)
  })

  it('should encode subdomain', () => {
    const result = dnsEncodeName('sub.vitalik.eth')
    expect(result).toBeTypeOf('string')
    expect(result.startsWith('0x')).toBe(true)
  })

  it('should encode empty string', () => {
    const result = dnsEncodeName('')
    expect(result).toBe('0x00')
  })

  it('should produce different results for different names', () => {
    const result1 = dnsEncodeName('vitalik.eth')
    const result2 = dnsEncodeName('nick.eth')
    expect(result1).not.toBe(result2)
  })
})

describe('encodeLabelhash', () => {
  it('should encode valid labelhash', () => {
    const hash =
      '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
    const result = encodeLabelhash(hash)
    expect(result).toBe(
      '[1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef]',
    )
  })

  it('should remove 0x prefix and wrap in brackets', () => {
    const hash =
      '0xabcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab'
    const result = encodeLabelhash(hash)
    expect(result.startsWith('[')).toBe(true)
    expect(result.endsWith(']')).toBe(true)
    expect(result).not.toContain('0x')
  })

  it('should throw for invalid length (too short)', () => {
    const hash = '0x1234'
    expect(() => encodeLabelhash(hash)).toThrow(
      'Expected labelhash to have a length of 66',
    )
  })

  it('should throw for invalid length (too long)', () => {
    const hash =
      '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef00'
    expect(() => encodeLabelhash(hash)).toThrow(
      'Expected labelhash to have a length of 66',
    )
  })

  it('should throw for missing 0x prefix (wrong length)', () => {
    const hash =
      '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as `0x${string}`
    expect(() => encodeLabelhash(hash)).toThrow(
      'Expected labelhash to have a length of 66',
    )
  })
})
