import { describe, expect, it } from 'vitest'
import { dnsEncodeName, encodeLabelhash } from './dnsEncodeName'

describe('dnsEncodeName', () => {
  it('should encode domain names to hex format', () => {
    const result = dnsEncodeName('vitalik.eth')
    expect(result).toBeTypeOf('string')
    expect(result.startsWith('0x')).toBe(true)
  })

  it('should encode empty string as 0x00', () => {
    expect(dnsEncodeName('')).toBe('0x00')
  })
})

describe('encodeLabelhash', () => {
  it('should remove 0x prefix and wrap in brackets', () => {
    const hash =
      '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
    expect(encodeLabelhash(hash)).toBe(
      '[1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef]',
    )
  })

  it('should throw for invalid labelhash length', () => {
    expect(() => encodeLabelhash('0x1234')).toThrow(
      'Expected labelhash to have a length of 66',
    )
    expect(() =>
      encodeLabelhash(
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef00',
      ),
    ).toThrow('Expected labelhash to have a length of 66')
  })
})
