import {
  computeWrapperRegistryAddress,
  getDestinationContracts,
} from '@ens-apps/smart-account'
import { mainnet, sepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import { getExpectedWrapperRegistry } from './wrapperRegistry'

describe('getExpectedWrapperRegistry', () => {
  it("derives the name's wrapper from the chain's migration contracts", () => {
    expect(
      getExpectedWrapperRegistry({ name: 'alice.eth', chainId: sepolia.id }),
    ).toBe(
      computeWrapperRegistryAddress({
        name: 'alice.eth',
        contracts: getDestinationContracts(sepolia.id),
      }),
    )
  })

  it('normalises the name first', () => {
    expect(
      getExpectedWrapperRegistry({ name: 'Alice.ETH', chainId: sepolia.id }),
    ).toBe(
      getExpectedWrapperRegistry({ name: 'alice.eth', chainId: sepolia.id }),
    )
  })

  it('returns null on a chain without migration contracts', () => {
    expect(
      getExpectedWrapperRegistry({ name: 'alice.eth', chainId: mainnet.id }),
    ).toBeNull()
  })

  it('returns null for a name that cannot be normalised', () => {
    expect(
      getExpectedWrapperRegistry({ name: 'a b.eth', chainId: sepolia.id }),
    ).toBeNull()
  })

  it('returns null for a non-.eth name', () => {
    expect(
      getExpectedWrapperRegistry({ name: 'alice.xyz', chainId: sepolia.id }),
    ).toBeNull()
  })
})
