/**
 * Hook for getting subregistry address from a registry contract
 *
 * Returns contract parameters for calling getSubregistry on the registry.
 * The caller is responsible for executing the read with useReadContract.
 */

import type { Address } from 'viem'
import { registryGetSubregistrySnippet } from '../IRegistry'

export type UseGetSubregistryParameters = {
  registryAddress: Address
}

export type GetSubregistryRequest = {
  address: Address
  abi: typeof registryGetSubregistrySnippet
  functionName: 'getSubregistry'
  args: readonly [label: string]
}

export type UseGetSubregistryReturn = {
  /**
   * Get contract call parameters for reading a subregistry address
   * @param label - The label of the subregistry to get
   * @returns Contract parameters to pass to useReadContract
   */
  getSubregistryRequest: (label: string) => GetSubregistryRequest
  /**
   * The registry address
   */
  registryAddress: Address
}

export function useGetSubregistry({
  registryAddress,
}: UseGetSubregistryParameters): UseGetSubregistryReturn {
  const getSubregistryRequest = (label: string): GetSubregistryRequest => {
    return {
      address: registryAddress,
      abi: registryGetSubregistrySnippet,
      functionName: 'getSubregistry',
      args: [label] as const,
    }
  }

  return {
    getSubregistryRequest,
    registryAddress,
  }
}
