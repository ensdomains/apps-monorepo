/**
 * Utility for creating forward resolution (name → address) contract calls
 *
 * Returns contract parameters for calling setAddr on the resolver.
 * Uses ensjs setAddrParameters for correct address encoding.
 */

import { setAddrParameters } from '@ensdomains/ensjs/utils'
import type { Address } from 'viem'
import { zeroAddress } from 'viem'
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
}: {
  name: string | undefined
  reverseRegistrarChainId: ReverseRegistrarChainId
  resolverAddress: Address | null | undefined
  targetAddress: Address
}) {
  if (!name) {
    throw new Error('No name provided')
  }

  if (!resolverAddress || resolverAddress === zeroAddress) {
    throw new Error(
      `No resolver found for name: ${name}. Set a resolver for this name first (e.g. via the Manager app).`,
    )
  }

  if (resolverAddress.toLowerCase() === targetAddress.toLowerCase()) {
    throw new Error(
      `The resolver for ${name} is set to your own address (${resolverAddress}), which is not a valid resolver contract. Update the resolver for this name to a valid resolver contract (e.g. the Public Resolver) before setting forward resolution.`,
    )
  }

  const setAddr = setAddrParameters({
    name,
    coin: 60,
    value: targetAddress,
  })

  return {
    address: resolverAddress,
    ...setAddr,
  }
}
