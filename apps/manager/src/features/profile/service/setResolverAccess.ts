import type { Address, PublicClient } from 'viem'
import { BaseError, ExecutionRevertedError } from 'viem'
import {
  buildSetResolverCall,
  type NameRegistryLocation,
} from './changeResolver'

/**
 * Dry-run the registry call that completes resolver setup from the owner EOA.
 * A contract revert means the owner cannot repoint the name. Transport errors
 * remain unknown and are propagated so callers do not mistake them for a role
 * failure.
 */
export const canSetNameResolver = async ({
  location,
  resolver,
  ownerAddress,
  publicClient,
}: {
  readonly location: NameRegistryLocation
  readonly resolver: Address
  readonly ownerAddress: Address
  readonly publicClient: PublicClient
}): Promise<boolean> => {
  const { to, data } = buildSetResolverCall({
    ...location,
    newResolver: resolver,
  })

  try {
    await publicClient.call({ account: ownerAddress, to, data })
    return true
  } catch (error) {
    if (
      error instanceof BaseError &&
      error.walk((cause) => cause instanceof ExecutionRevertedError)
    ) {
      return false
    }
    throw error
  }
}
