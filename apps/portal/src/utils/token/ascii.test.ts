import { describe, expect, it } from 'vitest'
import { asciiEncode } from './ascii'

describe('asciiEncode', () => {
  it('should encode valid domain name', () => {
    expect(asciiEncode('example.com')).toBe('example.com')
  })

  it('should encode subdomain', () => {
    expect(asciiEncode('sub.example.com')).toBe('sub.example.com')
  })

  it('should handle IDN (internationalized domain names)', () => {
    // xn-- is punycode prefix for internationalized domains
    expect(asciiEncode('münchen.de')).toBe('xn--mnchen-3ya.de')
  })

  it('should return original string for invalid domains', () => {
    expect(asciiEncode('not a valid domain')).toBe('not a valid domain')
    expect(asciiEncode('')).toBe('')
  })

  it('should handle emoji domains', () => {
    // Emojis get punycode encoded
    const result = asciiEncode('💩.eth')
    expect(result).toContain('xn--')
  })

  it('should handle special characters', () => {
    expect(asciiEncode('test!@#.com')).toBe('test!@#.com')
  })
})
