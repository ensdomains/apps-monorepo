import type { Client } from 'viem'
import { sepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import { requireChainId } from './require-chain-id'

const clientWith = (chain: Client['chain']) =>
  ({ chain }) as Pick<Client, 'chain'>

describe('requireChainId', () => {
  it('returns the chain id when the client has a chain', () => {
    expect(requireChainId(clientWith(sepolia), 'registration')).toBe(sepolia.id)
  })

  // The whole point: substituting a network here would produce well-formed
  // calldata aimed at another chain's contracts, which the signer would sign.
  it.each([
    ['a client with no chain', clientWith(undefined)],
    ['no client at all', undefined],
  ])('throws for %s rather than assuming a network', (_label, client) => {
    expect(() => requireChainId(client, 'registration')).toThrow(
      /Refusing to guess a network/,
    )
  })

  it('names the caller so the construction bug is findable', () => {
    expect(() => requireChainId(undefined, 'HCA registration')).toThrow(
      /^HCA registration:/,
    )
  })
})
