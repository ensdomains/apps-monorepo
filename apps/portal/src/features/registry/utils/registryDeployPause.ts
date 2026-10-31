import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { ensChain } from '@/lib/wagmi'
import { isPendingUpgradeImplementation } from './pendingUpgradeRegistry'

/** Deploying a new subregistry waits until ensjs deploys an implementation that isn't pending an upgrade. */
export const IS_REGISTRY_DEPLOY_PAUSED = isPendingUpgradeImplementation({
  chainId: ensChain.id,
  implementation: getChainContractAddress({
    chain: ensChain,
    contract: 'ensUserRegistryImpl',
  }),
})
