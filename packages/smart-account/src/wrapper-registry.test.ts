import { namehash } from 'viem'
import { sepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import { getDestinationContracts } from './providers/rhinestone/manifest'
import { computeVerifiableProxyAddress } from './verifiable-factory'
import { computeWrapperRegistryAddress } from './wrapper-registry'

const contracts = getDestinationContracts(sepolia.id)

describe('computeWrapperRegistryAddress', () => {
  it('deploys a 2LD wrapper from LockedMigrationController', () => {
    expect(
      computeWrapperRegistryAddress({ name: 'parent.eth', contracts }),
    ).toBe(
      computeVerifiableProxyAddress({
        factory: contracts.verifiableFactory,
        proxyLogic: contracts.verifiableFactoryProxyLogic,
        deployer: contracts.lockedMigrationController,
        salt: BigInt(namehash('parent.eth')),
      }),
    )
  })

  it("deploys a child wrapper from its parent's wrapper", () => {
    const parent = computeVerifiableProxyAddress({
      factory: contracts.verifiableFactory,
      proxyLogic: contracts.verifiableFactoryProxyLogic,
      deployer: contracts.lockedMigrationController,
      salt: BigInt(namehash('parent.eth')),
    })

    expect(
      computeWrapperRegistryAddress({ name: 'sub.parent.eth', contracts }),
    ).toBe(
      computeVerifiableProxyAddress({
        factory: contracts.verifiableFactory,
        proxyLogic: contracts.verifiableFactoryProxyLogic,
        deployer: parent,
        salt: BigInt(namehash('sub.parent.eth')),
      }),
    )
  })

  it.each([
    'eth',
    'parent.example',
    'parent..eth',
    '',
  ])('returns null for %j', (name) => {
    expect(computeWrapperRegistryAddress({ name, contracts })).toBeNull()
  })
})
