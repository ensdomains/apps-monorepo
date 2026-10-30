import { getDestinationContracts } from '@ens-apps/smart-account'
import { mainnet, sepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import { isPendingUpgradeImplementation } from './pendingUpgradeRegistry'

describe('isPendingUpgradeImplementation', () => {
  it.each([mainnet.id, sepolia.id])(
    'flags the UserRegistry implementation deployed on chain %i',
    (chainId) => {
      expect(
        isPendingUpgradeImplementation({
          chainId,
          implementation: getDestinationContracts(chainId).userRegistryImpl,
        }),
      ).toBe(true)
    },
  )

  it.each([mainnet.id, sepolia.id])(
    'leaves the WrapperRegistry implementation on chain %i alone',
    (chainId) => {
      expect(
        isPendingUpgradeImplementation({
          chainId,
          implementation: getDestinationContracts(chainId).wrapperRegistryImpl,
        }),
      ).toBe(false)
    },
  )

  it('needs the address on the same chain', () => {
    expect(
      isPendingUpgradeImplementation({
        chainId: sepolia.id,
        implementation: getDestinationContracts(mainnet.id).userRegistryImpl,
      }),
    ).toBe(false)
  })
})
