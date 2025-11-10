/**
 * Hook for setting reverse resolution name (address → name)
 *
 * Returns contract parameters for calling setName on the L2 Reverse Registrar.
 * The caller is responsible for executing the transaction and waiting for confirmation.
 *
 * This sets the reverse resolution for a specific coin type, which allows
 * an address to resolve to an ENS name on that chain/network.
 */

import type { ChainWithEns } from '@ensdomains/ensjs/chain'
import type { Address } from 'viem'
import {
  l2ReverseRegistrarSetNameForAddrSnippet,
  l2ReverseRegistrarSetNameSnippet,
} from '../L2ReverseRegistrar'
import {
  getRegistrarAddress,
  type ReverseRegistrarCoinId,
  resolveNetworkFromChain,
} from '../reverseRegistrarCoinIds'

export type UseSetReverseNameParameters = {
  reverseRegistrarCoinId: ReverseRegistrarCoinId
  /**
   * Chain used to resolve which registrar deployment to use.
   * If omitted or unknown, we default to 'sepolia' (current app default).
   */
  chain?: ChainWithEns
}

export type SetReverseNameRequest =
  | {
      address: Address
      abi: typeof l2ReverseRegistrarSetNameForAddrSnippet
      functionName: 'setNameForAddr'
      args: readonly [address: Address, name: string]
    }
  | {
      address: Address
      abi: typeof l2ReverseRegistrarSetNameSnippet
      functionName: 'setName'
      args: readonly [name: string]
    }

export type UseSetReverseNameReturnType = {
  /**
   * Get contract call parameters for setting the reverse name
   * @param name - The ENS name to set
   * @param address - Optional address to set the name for. If not provided, sets for the caller
   * @returns Contract parameters to pass to writeContract
   * @throws Error if no registrar is found for the coin type
   */
  getSetReverseNameRequest: (
    name: string,
    address?: Address,
  ) => SetReverseNameRequest
  /**
   * The registrar address for this coin type (undefined if not available)
   */
  registrarAddress: Address | undefined
}

export function useSetReverseName({
  reverseRegistrarCoinId,
  chain,
}: UseSetReverseNameParameters): UseSetReverseNameReturnType {
  const network = resolveNetworkFromChain(chain)
  const registrarAddress = getRegistrarAddress(reverseRegistrarCoinId, network)

  const getSetReverseNameRequest = (
    name: string,
    address?: Address,
  ): SetReverseNameRequest => {
    if (!registrarAddress) {
      throw new Error(
        `No registrar found for coin type ${reverseRegistrarCoinId} on ${network}`,
      )
    }

    if (address) {
      // Set name for a specific address
      return {
        address: registrarAddress,
        abi: l2ReverseRegistrarSetNameForAddrSnippet,
        functionName: 'setNameForAddr',
        args: [address, name] as const,
      }
    } else {
      // Set name for caller
      return {
        address: registrarAddress,
        abi: l2ReverseRegistrarSetNameSnippet,
        functionName: 'setName',
        args: [name] as const,
      }
    }
  }

  return {
    getSetReverseNameRequest,
    registrarAddress,
  }
}
