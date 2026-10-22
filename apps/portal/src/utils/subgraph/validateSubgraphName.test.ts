import { namehash } from 'viem/ens'
import { describe, expect, it } from 'vitest'
import {
  validateSubgraphName,
  validateSubgraphNames,
} from './validateSubgraphName'

describe('validateSubgraphName', () => {
  it('keeps a name that hashes to its id', () => {
    expect(
      validateSubgraphName({ id: namehash('valid.eth'), name: 'valid.eth' }),
    ).toBe('valid.eth')
  })

  it('replaces a name that does not hash to its id with its actual hash', () => {
    expect(
      validateSubgraphName({ id: namehash('other.eth'), name: 'reported.eth' }),
    ).toBe(namehash('reported.eth'))
  })

  it('leaves encoded and absent names unchanged', () => {
    const encoded = '[0123].eth'
    expect(validateSubgraphName({ id: '0x01', name: encoded })).toBe(encoded)
    expect(validateSubgraphName({ id: '0x01', name: null })).toBeNull()
  })

  it('validates nested GraphQL values', () => {
    const response = {
      domains: [
        {
          id: namehash('actual.eth'),
          name: 'reported.eth',
          parent: { id: namehash('parent.eth'), name: 'parent.eth' },
        },
      ],
    }

    const validated = validateSubgraphNames(response)

    expect(validated.domains[0]?.name).toBe(namehash('reported.eth'))
    expect(validated.domains[0]?.parent.name).toBe('parent.eth')
    expect(response.domains[0]?.name).toBe(namehash('reported.eth'))
  })
})
