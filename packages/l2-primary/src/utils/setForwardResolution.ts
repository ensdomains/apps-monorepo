/**
 * Utility for creating forward resolution (name → address) contract calls
 *
 * Returns contract parameters for calling setAddr on the resolver.
 * Uses ensjs setAddrParameters for correct address encoding.
 * Handles both Public Resolver and Dedicated Resolver.
 * Includes EIP-7825 gas cap for Sepolia/Holesky.
 */

import { setAddrParameters } from '@ensdomains/ensjs/utils'
import type { Address } from 'viem'
import { zeroAddress } from 'viem'
import { namehash } from 'viem/ens'
import type { ReverseRegistrarChainId } from '../reverseRegistrarChainIds'

export type SetForwardResolutionRequest = ReturnType<
  typeof createSetForwardResolutionRequest
>

/**
 * Creates contract call parameters for setting forward resolution
 */
export function createSetForwardResolutionRequest({
  name,
  reverseRegistrarChainId: _reverseRegistrarChainId,
  resolverAddress,
  targetAddress,
  isDedicatedResolver = false,
}: {
  name: string | undefined
  reverseRegistrarChainId: ReverseRegistrarChainId
  resolverAddress: Address | null | undefined
  targetAddress: Address
  isDedicatedResolver?: boolean
}) {
  if (!name) {
    throw new Error('No name provided')
  }

  if (!resolverAddress || resolverAddress === zeroAddress) {
    throw new Error(
      `No resolver found for name: ${name}. Set a resolver for this name first (e.g. via the Manager app).`,
    )
  }

  const setAddr = setAddrParameters({
    namehash: isDedicatedResolver ? undefined : namehash(name),
    coin: 60,
    value: targetAddress,
  })

  return {
    address: resolverAddress,
    ...setAddr,
  }
}
