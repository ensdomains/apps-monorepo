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

  it('parses subnames', () => {
    expect(parseSearchQuery('sub.bigint.eth')).toEqual({
      type: 'name',
      value: 'sub.bigint.eth',
    })
  })

  it('lowercases names', () => {
    expect(parseSearchQuery('BigInt')).toEqual({
      type: 'name',
      value: 'bigint.eth',
    })
  })

  it('parses a valid address', () => {
    const address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
    const result = parseSearchQuery(address)
    expect(result.type).toBe('address')
  })
})
