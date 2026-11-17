import { describe, expect, it } from 'vitest'
import { isIndexedResolver } from './registry'

// zigens answers `resolver(id)` for any address; these are its answers on Sepolia.
const UNUSED = { resolver: { roleHolderCount: 0, events: [] }, resolvers: [] }

describe('isIndexedResolver', () => {
  it.each([
    {
      case: 'an address neither source has seen',
      v2: UNUSED,
      v1: [],
      indexed: false,
    },
    {
      case: 'a resolver that emitted events',
      v2: {
        ...UNUSED,
        resolver: { roleHolderCount: 0, events: [{ id: 'e' }] },
      },
      v1: [],
      indexed: true,
    },
    {
      case: 'a resolver with role holders only',
      v2: { ...UNUSED, resolver: { roleHolderCount: 2, events: [] } },
      v1: [],
      indexed: true,
    },
    { case: 'an ENSv1 resolver', v2: UNUSED, v1: [{ id: 'r' }], indexed: true },
  ])('is $indexed for $case', ({ v2, v1, indexed }) => {
    expect(isIndexedResolver(v2, v1)).toBe(indexed)
  })
})
