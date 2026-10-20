import { describe, expect, it } from 'vitest'
import { asciiEncode, isAscii } from './ascii'

describe('isAscii', () => {
  it('should accept ASCII names, including punycode', () => {
    expect(isAscii('nic.com')).toBe(true)
    expect(isAscii('xn--bcher-kva.com')).toBe(true)
  })

  it('should reject names with non-ASCII characters', () => {
    expect(isAscii('bücher.com')).toBe(false)
    expect(isAscii('💩.com')).toBe(false)
  })
})

describe('asciiEncode', () => {
  it('should return ASCII names unchanged', () => {
    expect(asciiEncode('example.com')).toBe('example.com')
    expect(asciiEncode('sub.example.com')).toBe('sub.example.com')
  })

  it('should punycode encode internationalized domain names', () => {
    expect(asciiEncode('münchen.de')).toBe('xn--mnchen-3ya.de')
    expect(asciiEncode('💩.eth')).toContain('xn--')
  })

  it('should return invalid inputs unchanged', () => {
    expect(asciiEncode('not a valid domain')).toBe('not a valid domain')
    expect(asciiEncode('')).toBe('')
  })
})
