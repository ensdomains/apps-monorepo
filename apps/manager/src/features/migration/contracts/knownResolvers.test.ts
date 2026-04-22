import { describe, expect, it } from 'vitest'
import { isKnownPublicResolver } from './knownResolvers'

describe('isKnownPublicResolver', () => {
  it('returns false for null', () => {
    expect(isKnownPublicResolver(null)).toBe(false)
  })

  it('returns false for an empty string', () => {
    expect(isKnownPublicResolver('')).toBe(false)
  })

  it('returns true for a known resolver (lowercase)', () => {
    expect(
      isKnownPublicResolver('0x640294a2b2d87e7f522db3e3e3e876764bce170d'),
    ).toBe(true)
  })

  it('returns true for a known resolver (mixed case / checksum)', () => {
    expect(
      isKnownPublicResolver('0x1da022710dF5002339274AaDEe8D58218e9D6AB5'),
    ).toBe(true)
  })

  it('returns true for a known resolver (uppercase input)', () => {
    expect(
      isKnownPublicResolver('0xC30BA2BD21583605D815826C3807E8224E398E10'),
    ).toBe(true)
  })

  it('returns false for an unknown resolver', () => {
    expect(
      isKnownPublicResolver('0x0000000000000000000000000000000000000001'),
    ).toBe(false)
  })
})
