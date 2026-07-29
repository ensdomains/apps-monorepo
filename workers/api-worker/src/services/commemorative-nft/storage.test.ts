import { describe, expect, it } from 'vitest'
import { matchesIfNoneMatch, parseSingleByteRange } from './storage'

describe('commemorative NFT byte ranges', () => {
  it('parses bounded, open-ended, and suffix ranges', () => {
    expect(parseSingleByteRange('bytes=2-5', 10)).toEqual({
      range: { end: 5, length: 4, offset: 2 },
      status: 'valid',
    })
    expect(parseSingleByteRange('bytes=7-', 10)).toEqual({
      range: { end: 9, length: 3, offset: 7 },
      status: 'valid',
    })
    expect(parseSingleByteRange('bytes=-4', 10)).toEqual({
      range: { end: 9, length: 4, offset: 6 },
      status: 'valid',
    })
  })

  it('clamps ranges to the stored object', () => {
    expect(parseSingleByteRange('bytes=8-999999999999999999999', 10)).toEqual({
      range: { end: 9, length: 2, offset: 8 },
      status: 'valid',
    })
    expect(parseSingleByteRange('bytes=-999999999999999999999', 10)).toEqual({
      range: { end: 9, length: 10, offset: 0 },
      status: 'valid',
    })
  })

  it('rejects multiple and unsatisfiable ranges', () => {
    expect(parseSingleByteRange('bytes=0-1,3-4', 10)).toEqual({
      status: 'invalid',
    })
    expect(parseSingleByteRange('bytes=10-', 10)).toEqual({
      status: 'invalid',
    })
    expect(parseSingleByteRange('bytes=5-4', 10)).toEqual({
      status: 'invalid',
    })
    expect(parseSingleByteRange('bytes=-0', 10)).toEqual({
      status: 'invalid',
    })
  })
})

describe('commemorative NFT conditional requests', () => {
  it('matches wildcard, weak, and comma-separated ETags', () => {
    expect(matchesIfNoneMatch('*', '"asset"')).toBe(true)
    expect(matchesIfNoneMatch('W/"asset"', '"asset"')).toBe(true)
    expect(matchesIfNoneMatch('"other", "asset"', '"asset"')).toBe(true)
    expect(matchesIfNoneMatch('"other"', '"asset"')).toBe(false)
  })
})
