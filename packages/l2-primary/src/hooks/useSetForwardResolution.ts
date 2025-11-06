/**
 * Hook for setting forward resolution (name → address)
 *
 * This sets the address record for a specific coin type on the name's resolver,
 * which makes the name point to that address. Combined with reverse resolution,
 * this creates a "primary name" (bidirectional relationship).
 */

import { publicResolverSetAddrSnippet } from '@ensdomains/ensjs/contracts'
import type { Address } from 'viem'
import { namehash } from 'viem/ens'
import {
  useEnsResolver,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import type { CoinType } from '../chains'

export type UseSetForwardResolutionParams = {
  name: string
  coinType: CoinType
}

export type UseSetForwardResolutionReturn = {
  setAddress: (address: Address) => void
  hash: `0x${string}` | undefined
  isPending: boolean
  isSuccess: boolean
  error: Error | null
  resolverAddress: Address | undefined
}

export function useSetForwardResolution({
  name,
  coinType,
}: UseSetForwardResolutionParams): UseSetForwardResolutionReturn {
  const { data: resolverAddress } = useEnsResolver({ name })

  const { data: hash, writeContract, isPending, error } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  })

  const setAddress = (address: Address) => {
    if (!resolverAddress) {
      throw new Error(`No resolver found for name: ${name}`)
    }

    writeContract({
      address: resolverAddress,
      abi: publicResolverSetAddrSnippet,
      functionName: 'setAddr',
      args: [namehash(name), BigInt(coinType), address],
    })
  }

  return {
    setAddress,
    hash,
    isPending: isPending || isConfirming,
    isSuccess,
    error,
    resolverAddress,
  }
}
