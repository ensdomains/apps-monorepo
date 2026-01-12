import { describe, expect, it } from 'vitest'
import { recordTypeToSubgraphKey } from './recordTypeToSubgraphKey'

describe('recordTypeToSubgraphKey', () => {
  it('should map record types to subgraph keys', () => {
    expect(recordTypeToSubgraphKey('address')).toBe('coins')
    expect(recordTypeToSubgraphKey('text')).toBe('texts')
    expect(recordTypeToSubgraphKey('contentHash')).toBe('contentHash')
  })

  it('should return input for any other type (default case)', () => {
    // @ts-expect-error - Testing runtime behavior with unknown type
    expect(recordTypeToSubgraphKey('unknown')).toBe('unknown')
    // @ts-expect-error - Testing runtime behavior with unknown type
    expect(recordTypeToSubgraphKey('custom')).toBe('custom')
  })
})
