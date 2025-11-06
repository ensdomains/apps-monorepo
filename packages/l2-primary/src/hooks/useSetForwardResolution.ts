/**
 * Hook for setting forward resolution (name → address)
 *
 * Returns contract parameters for calling setAddr on the resolver.
 * The caller is responsible for executing the transaction and waiting for confirmation.
 *
 * This sets the address record for a specific coin type on the name's resolver,
 * which makes the name point to that address. Combined with reverse resolution,
 * this creates a "primary name" (bidirectional relationship).
 */

import { publicResolverSetAddrSnippet } from '@ensdomains/ensjs/contracts'
import type { Address } from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import { namehash } from 'viem/ens'
import { useAccount, useEnsResolver } from 'wagmi'
import type { CoinType } from '../chains'

export type UseSetForwardResolutionParams = {
  name: string
  coinType: CoinType
  enabled?: boolean
}

export type SetForwardResolutionRequest = {
  address: Address
  abi: typeof publicResolverSetAddrSnippet
  functionName: 'setAddr'
  args: readonly [node: `0x${string}`, coinType: bigint, address: Address]
}

export type UseSetForwardResolutionReturn = {
  /**
   * Get contract call parameters for setting the address
   * @param address - The address to set for this name
   * @returns Contract parameters to pass to writeContract
   * @throws Error if no resolver is found
   */
  getSetAddressRequest: (address: Address) => SetForwardResolutionRequest
  /**
   * The resolver address for this name (undefined if not resolved yet)
   */
  resolverAddress: Address | undefined
  /**
   * Whether the resolver is being fetched
   */
  isLoading: boolean
}

export function useSetForwardResolution({
  name,
  coinType,
  enabled = true,
}: UseSetForwardResolutionParams): UseSetForwardResolutionReturn {
  const { chain } = useAccount()
  // Only enable resolver lookup on L1 chains (sepolia/mainnet) which have ENS contracts
  const isL1Chain = chain?.id === mainnet.id || chain?.id === sepolia.id
  const shouldEnable = enabled && isL1Chain && !!name

  const { data: resolverAddress, isLoading } = useEnsResolver({
    name,
    query: { enabled: shouldEnable },
  })

  const getSetAddressRequest = (
    address: Address,
  ): SetForwardResolutionRequest => {
    if (!resolverAddress) {
      throw new Error(`No resolver found for name: ${name}`)
    }

    return {
      address: resolverAddress,
      abi: publicResolverSetAddrSnippet,
      functionName: 'setAddr',
      args: [namehash(name), BigInt(coinType), address] as const,
    }
  }

  return {
    getSetAddressRequest,
    resolverAddress,
    isLoading,
  }
}
