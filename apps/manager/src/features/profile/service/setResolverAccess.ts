import type { Address, PublicClient } from 'viem'
import { BaseError, ExecutionRevertedError } from 'viem'
import { buildSetResolverCall } from './changeResolver'

/**
 * Dry-run the registry call that completes resolver setup from the owner EOA.
 * A contract revert means the owner cannot repoint the name. Transport errors
 * remain unknown and are propagated so callers do not mistake them for a role
 * failure.
 */
export const canSetNameResolver = async ({
  name,
  resolver,
  ownerAddress,
  publicClient,
}: {
  readonly name: string
  readonly resolver: Address
  readonly ownerAddress: Address
  readonly publicClient: PublicClient
}): Promise<boolean> => {
  const { to, data } = buildSetResolverCall({ name, newResolver: resolver })

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
