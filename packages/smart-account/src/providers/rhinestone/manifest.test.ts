import { isAddress } from 'viem'
import { sepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import { getDestinationContracts } from './manifest'

describe('remediated Sepolia destination manifest', () => {
  it('pins the complete PR #388 integration namespace', () => {
    const contracts = getDestinationContracts(sepolia.id)

    expect(contracts).toEqual({
      standaloneHcaFactory: '0x900FF7cF617Ef9D802178B4ef480491e3A782672',
      standaloneHcaImplementation: '0xD213De41421Fed3a5E475943F9D634A0cf64a385',
      hcaOwnerAndSessionValidator: '0x976D90c51Afb2C11660EaeE94bD42A7e84751D08',
      verifiableFactory: '0x10dC6333CDFe1FCEf624c6e0a8221b91804Cd7ef',
      verifiableFactoryProxyLogic: '0xA136BeE4E37B44586242e516a39893EfD54315e9',
      verifiableFactoryDeployBlock: 11_383_823n,
      permissionedResolverImpl: '0x9EAe5C2730a7dD16BDD1DeE6421a1B91e3B0365e',
      ethRegistrar: '0xa88553F454b77203B0D036A05c894d555EAAa2Cc',
      ethRegistry: '0xBDC85dD5b15D7ecb354cd7cb6f2c50b4f2c4F0E2',
      rootRegistry: '0x8115186e8f2e0b0281e86ab91f0f48ba90364354',
      migrationHelper: '0xddC597d937618849348E18Db5D631Ce747bCDeEF',
      unlockedMigrationController: '0x2FCf83232b93bD29C59dB18AaA1D4b62e9f9FC73',
      lockedMigrationController: '0x5c39E36a69A9897F08954c71aCB1F36E0Bd4f409',
      publicResolverSet: '0xf2794ebd70c1fa74094a9ec653da1c2df9f5a5a9',
      wrapperRegistryImpl: '0x433f81a3e8921fc868ae1a04576f135d9a75b0f2',
      publicResolverV2: '0xe7b9a25607e02da8145e4eb1836ca539e53f11f7',
      defaultReverseRegistrarAdapter:
        '0x7a84e241f862D73960D73c26d68c3C8F89F0B18F',
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
