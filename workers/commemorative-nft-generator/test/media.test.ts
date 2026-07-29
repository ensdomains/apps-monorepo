import { describe, expect, it } from 'vitest'
import { sha256Hex, validateH264Mp4, validatePng } from '../src/media.js'

describe('generated media validation', () => {
  it('recognizes PNG and H.264 MP4 signatures', () => {
    expect(() =>
      validatePng(
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]),
      ),
    ).not.toThrow()
    expect(() =>
      validateH264Mp4(
        new TextEncoder().encode('0000ftyp00000000moov00000000avc1'),
      ),
    ).not.toThrow()
  })

  it('rejects empty or non-H.264 output', () => {
    expect(() => validatePng(new Uint8Array())).toThrow('valid non-empty PNG')
    expect(() =>
      validateH264Mp4(new TextEncoder().encode('0000ftyp00000000vp09')),
    ).toThrow('valid H.264 MP4')
  })

  it('produces stable SHA-256 hashes', () => {
    expect(sha256Hex('ens')).toBe(
      'd694d81e0716ed3837f317c1defe1747e30ef895531a772f621a908ca1a5d6b1',
    )
  })
})
