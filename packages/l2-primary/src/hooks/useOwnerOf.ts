/**
 * Hook for getting the owner of a token from a registry contract
 *
 * Returns contract parameters for calling ownerOf on the registry.
 * The caller is responsible for executing the read with useReadContract.
 */

import type { Address } from 'viem'
import { registryOwnerOfSnippet } from '../IRegistry'

export type UseOwnerOfParameters = {
  registryAddress: Address
}

export type OwnerOfRequest = {
  address: Address
  abi: typeof registryOwnerOfSnippet
  functionName: 'ownerOf'
  args: readonly [tokenId: bigint]
}

export type UseOwnerOfReturn = {
  /**
   * Get contract call parameters for reading the owner of a token
   * @param tokenId - The token ID to get the owner of
   * @returns Contract parameters to pass to useReadContract
   */
  getOwnerOfRequest: (tokenId: bigint) => OwnerOfRequest
  /**
   * The registry address
   */
  registryAddress: Address
}

export function useOwnerOf({
  registryAddress,
}: UseOwnerOfParameters): UseOwnerOfReturn {
  const getOwnerOfRequest = (tokenId: bigint): OwnerOfRequest => {
    return {
      address: registryAddress,
      abi: registryOwnerOfSnippet,
      functionName: 'ownerOf',
      args: [tokenId] as const,
    }
  }

  return {
    getOwnerOfRequest,
    registryAddress,
  }
}
