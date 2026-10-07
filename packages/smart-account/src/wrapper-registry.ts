import { type Address, namehash } from 'viem'
import type { DestinationContracts } from './providers/rhinestone/manifest'
import { computeVerifiableProxyAddress } from './verifiable-factory'

export type WrapperRegistryDeployers = Pick<
  DestinationContracts,
  | 'verifiableFactory'
  | 'verifiableFactoryProxyLogic'
  | 'lockedMigrationController'
>

/**
 * Derive the WrapperRegistry proxy that a locked migration deploys for a
 * `.eth` name. Each nested wrapper is deployed by its parent wrapper, beginning
 * at LockedMigrationController, so the address is fixed by the name alone: a
 * subregistry at this address is the canonical wrapper, with no RPC needed to
 * verify it.
 *
 * Returns `null` for anything that is not a `.eth` 2LD or deeper.
 */
export function computeWrapperRegistryAddress({
  name,
  contracts,
}: {
  readonly name: string
  readonly contracts: WrapperRegistryDeployers
}): Address | null {
  const labels = name.split('.')
  if (
    labels.length < 2 ||
    labels.some((label) => label.length === 0) ||
    labels.at(-1)?.toLowerCase() !== 'eth'
  )
    return null

  let deployer = contracts.lockedMigrationController
  let wrapper: Address | null = null

  for (let index = labels.length - 2; index >= 0; index -= 1) {
    wrapper = computeVerifiableProxyAddress({
      factory: contracts.verifiableFactory,
      proxyLogic: contracts.verifiableFactoryProxyLogic,
      deployer,
      salt: BigInt(namehash(labels.slice(index).join('.'))),
    })
    deployer = wrapper
  }

  return wrapper
}
