/**
 * Utility for creating forward resolution (name → address) contract calls
 *
 * Returns contract parameters for calling setAddr on the resolver.
 * The caller is responsible for:
 * 1. Getting the resolver address (e.g., via useEnsResolver)
 * 2. Executing the transaction
 * 3. Waiting for confirmation
 *
 * This sets the address record for a specific coin type on the name's resolver,
 * which makes the name point to that address. Combined with reverse resolution,
 * this creates a "primary name" (bidirectional relationship).
 */

import { publicResolverSetAddrSnippet } from '@ensdomains/ensjs/contracts'
import type { Address, Hex } from 'viem'
import { namehash } from 'viem/ens'
import type { ReverseRegistrarChainId } from '../reverseRegistrarChainIds'

export type SetForwardResolutionRequest = {
  address: Address
  abi: typeof publicResolverSetAddrSnippet
  functionName: 'setAddr'
  args: readonly [node: Hex, reverseRegistrarChainId: bigint, address: Address]
}

/**
 * Creates contract call parameters for setting forward resolution
 * @param params.name - The ENS name to set the address for
 * @param params.reverseRegistrarChainId - The chain ID for the reverse registrar
 * @param params.resolverAddress - The resolver contract address for this name
 * @param params.targetAddress - The address to set for this name
 * @returns Contract parameters to pass to writeContract
 * @throws Error if no resolver address is provided
 */
export function createSetForwardResolutionRequest({
  name,
  reverseRegistrarChainId,
  resolverAddress,
  targetAddress,
}: {
  name: string
  reverseRegistrarChainId: ReverseRegistrarChainId
  resolverAddress: Address | null | undefined
  targetAddress: Address
}): SetForwardResolutionRequest {
  if (!resolverAddress) {
    throw new Error(`No resolver found for name: ${name}`)
  }

  return {
    address: resolverAddress,
    abi: publicResolverSetAddrSnippet,
    functionName: 'setAddr',
    args: [
      namehash(name),
      BigInt(reverseRegistrarChainId),
      targetAddress,
    ] as const,
  }
}
