import { describe, expect, it } from 'vitest'
import { recordTypeToSubgraphKey } from './recordTypeToSubgraphKey'

describe('recordTypeToSubgraphKey', () => {
  it('should map "address" to "coins"', () => {
    expect(recordTypeToSubgraphKey('address')).toBe('coins')
  })

  it('should map "text" to "texts"', () => {
    expect(recordTypeToSubgraphKey('text')).toBe('texts')
  })

  it('should return the same value for "contentHash"', () => {
    expect(recordTypeToSubgraphKey('contentHash')).toBe('contentHash')
  })

  it('should return input for any other type (default case)', () => {
    // @ts-expect-error - Testing runtime behavior with unknown type
    expect(recordTypeToSubgraphKey('unknown')).toBe('unknown')
    // @ts-expect-error - Testing runtime behavior with unknown type
    expect(recordTypeToSubgraphKey('custom')).toBe('custom')
  })
})
