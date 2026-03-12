import {
  setPrimaryNameWriteParameters,
  setResolverWriteParameters,
} from '@ensdomains/ensjs/wallet'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { sepolia } from 'viem/chains'
import { useWalletClient } from 'wagmi'
import { getReverseNode } from '@/lib/reverse'
import { sepoliaWithEns } from '@/lib/wagmi'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const

export function useL1PrimaryNameMutations() {
  const queryClient = useQueryClient()
  const { data: walletClient } = useWalletClient({ chainId: sepolia.id })

  const invalidatePrimaryNameQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['get-reverse-resolution'] })
    queryClient.invalidateQueries({ queryKey: ['ens-name'] })
  }, [queryClient])

  const getSetPrimaryNameRequest = useCallback(
    (name: string) => {
      if (!walletClient?.account) throw new Error('Wallet not connected')
      return setPrimaryNameWriteParameters(
        {
          ...walletClient,
          chain: sepoliaWithEns,
        },
        { name },
      )
    },
    [walletClient],
  )

  const getResetPrimaryNameRequest = useCallback(
    (address: `0x${string}`) => {
      if (!walletClient?.account) throw new Error('Wallet not connected')
      const reverseNode = getReverseNode(address)
      return setResolverWriteParameters(
        {
          ...walletClient,
          chain: sepoliaWithEns,
        },
        {
          name: reverseNode,
          contract: 'registry',
          resolverAddress: ZERO_ADDRESS,
        },
      )
    },
    [walletClient],
  )

  return {
    getSetPrimaryNameRequest,
    getResetPrimaryNameRequest,
    invalidatePrimaryNameQueries,
    walletClient,
    isReady: !!walletClient?.account,
  }
}
