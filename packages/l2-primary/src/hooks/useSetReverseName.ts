/**
 * Hook for setting reverse resolution name (address → name)
 *
 * This sets the reverse resolution for a specific coin type, which allows
 * an address to resolve to an ENS name on that chain/network.
 */

import type { Address } from 'viem'
import { useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { type CoinType, getRegistrarAddress } from '../chains'
import {
  l2ReverseRegistrarSetNameForAddrSnippet,
  l2ReverseRegistrarSetNameSnippet,
} from '../L2ReverseRegistrar'

export type UseSetReverseNameParams = {
  coinType: CoinType
  isTestnet?: boolean
}

export type UseSetReverseNameReturn = {
  setName: (name: string, address?: Address) => void
  hash: `0x${string}` | undefined
  isPending: boolean
  isSuccess: boolean
  error: Error | null
}

export function useSetReverseName({
  coinType,
  isTestnet = false,
}: UseSetReverseNameParams): UseSetReverseNameReturn {
  const { data: hash, writeContract, isPending, error } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  })

  const setName = (name: string, address?: Address) => {
    const registrarAddress = getRegistrarAddress(coinType, isTestnet)

    if (!registrarAddress) {
      throw new Error(`No registrar found for coin type ${coinType}`)
    }

    if (address) {
      // Set name for a specific address
      writeContract({
        address: registrarAddress,
        abi: l2ReverseRegistrarSetNameForAddrSnippet,
        functionName: 'setNameForAddr',
        args: [address, name],
      })
    } else {
      // Set name for caller
      writeContract({
        address: registrarAddress,
        abi: l2ReverseRegistrarSetNameSnippet,
        functionName: 'setName',
        args: [name],
      })
    }
  }

  return {
    setName,
    hash,
    isPending: isPending || isConfirming,
    isSuccess,
    error,
  }
}
