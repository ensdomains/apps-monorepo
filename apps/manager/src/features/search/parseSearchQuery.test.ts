import { describe, expect, it } from 'vitest'
import { parseSearchQuery } from './parseSearchQuery'

describe('parseSearchQuery', () => {
  it('returns empty for blank input', () => {
    expect(parseSearchQuery('')).toEqual({ type: 'empty' })
    expect(parseSearchQuery('  ')).toEqual({ type: 'empty' })
  })

  it('parses a plain name and appends .eth', () => {
    expect(parseSearchQuery('bigint')).toEqual({
      type: 'name',
      value: 'bigint.eth',
    })
  })

  it('parses a name with TLD as-is', () => {
    expect(parseSearchQuery('bigint.eth')).toEqual({
      type: 'name',
      value: 'bigint.eth',
    })
  })

  it('preserves dotted names so unsupported TLDs can be classified', () => {
    expect(parseSearchQuery('vitalik.xyz')).toEqual({
      type: 'name',
      value: 'vitalik.xyz',
    })
  })

  it('parses subnames', () => {
    expect(parseSearchQuery('sub.bigint.eth')).toEqual({
      type: 'name',
      value: 'sub.bigint.eth',
    })
  })

  it('ENSIP-15-normalizes names, not just lowercasing', () => {
    expect(parseSearchQuery('BigInt')).toEqual({
      type: 'name',
      value: 'bigint.eth',
    })
    expect(parseSearchQuery('FOO.ETH')).toEqual({
      type: 'name',
      value: 'foo.eth',
    })
    expect(parseSearchQuery('ＦＯＯ.eth')).toEqual({
      type: 'name',
      value: 'foo.eth',
    })
  })

  it('returns invalid when ENSIP-15 normalization fails', () => {
    expect(parseSearchQuery('ab_c.eth')).toEqual({
      type: 'invalid',
      value: 'ab_c.eth',
    })
  })

  it('parses a valid address', () => {
    const address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
    const result = parseSearchQuery(address)
    expect(result.type).toBe('address')
  })
})
