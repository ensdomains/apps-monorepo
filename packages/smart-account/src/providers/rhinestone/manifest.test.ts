import { isAddress } from 'viem'
import { sepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import { getDestinationContracts } from './manifest'

describe('remediated Sepolia destination manifest', () => {
  it('pins the complete PR #388 integration namespace', () => {
    const contracts = getDestinationContracts(sepolia.id)

    expect(contracts).toEqual({
      standaloneHcaFactory: '0x900ff7cf617ef9d802178b4ef480491e3a782672',
      standaloneHcaImplementation: '0xd213de41421fed3a5e475943f9d634a0cf64a385',
      hcaOwnerAndSessionValidator: '0x976d90c51afb2c11660eaee94bd42a7e84751d08',
      verifiableFactory: '0x10dc6333cdfe1fcef624c6e0a8221b91804cd7ef',
      verifiableFactoryProxyLogic: '0xA136BeE4E37B44586242e516a39893EfD54315e9',
      verifiableFactoryDeployBlock: 11_383_823n,
      permissionedResolverImpl: '0x9eae5c2730a7dd16bdd1dee6421a1b91e3b0365e',
      ethRegistrar: '0xa88553f454b77203b0d036a05c894d555eaaa2cc',
      ethRegistry: '0xbdc85dd5b15d7ecb354cd7cb6f2c50b4f2c4f0e2',
      rootRegistry: '0x8115186e8f2e0b0281e86ab91f0f48ba90364354',
      migrationHelper: '0x1d8c7aa9862f9b823309ad87a4864fb27c575e85',
      unlockedMigrationController: '0x2fcf83232b93bd29c59db18aaa1d4b62e9f9fc73',
      lockedMigrationController: '0x5c39e36a69a9897f08954c71acb1f36e0bd4f409',
      publicResolverSet: '0xf2794ebd70c1fa74094a9ec653da1c2df9f5a5a9',
      wrapperRegistryImpl: '0x433f81a3e8921fc868ae1a04576f135d9a75b0f2',
      publicResolverV2: '0xe7b9a25607e02da8145e4eb1836ca539e53f11f7',
      defaultReverseRegistrarAdapter:
        '0x7a84e241f862d73960d73c26d68c3c8f89f0b18f',
      usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    })
  })

  it('contains only valid addresses alongside the bigint deploy block', () => {
    const contracts = getDestinationContracts(sepolia.id)
    for (const [key, value] of Object.entries(contracts)) {
      if (key === 'verifiableFactoryDeployBlock') {
        expect(value).toBe(11_383_823n)
        continue
      }
      expect(isAddress(value as string), key).toBe(true)
    }
  })
})
