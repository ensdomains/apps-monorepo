import type { CoinType } from '@ens-apps/l2-primary/chains'
import {
  useSetForwardResolution,
  useSetReverseName,
} from '@ens-apps/l2-primary/hooks'
import type { ChainWithEns } from '@ensdomains/ensjs/chain'
import { setPrimaryName } from '@ensdomains/ensjs/wallet'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { Account, Address, Transport } from 'viem'
import { createWalletClient } from 'viem'
import { sepolia } from 'viem/chains'
import {
  useWaitForTransactionReceipt,
  useWalletClient,
  useWriteContract,
} from 'wagmi'
import { wagmiConfig } from '@/lib/wagmi'

export type UseReverseResolutionMutationsParams = {
  coinType: CoinType
  isTestnet: boolean
  displayName: string | null
}

export function useReverseResolutionMutations({
  coinType,
  isTestnet,
  displayName,
}: UseReverseResolutionMutationsParams) {
  const queryClient = useQueryClient()
  const { data: walletClient } = useWalletClient()
  const isL1 = Number(coinType) === 60 || Number(coinType) === 1

  const l1SetPrimaryNameMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!walletClient) throw new Error('Wallet client not found')
      if (!walletClient.account) throw new Error('No connected account')
      const ensChain = wagmiConfig.chains.find((c) => c.id === sepolia.id)
      if (!ensChain) {
        throw new Error(
          `L1 chain not found in config (${isTestnet ? 'sepolia' : 'mainnet'})`,
        )
      }
      const ensEnabledChain = ensChain as ChainWithEns<typeof sepolia>

      const clientToUse =
        walletClient.chain?.id === sepolia.id
          ? { ...walletClient, chain: ensEnabledChain }
          : createWalletClient({
              account: walletClient.account as Account,
              chain: ensEnabledChain,
              transport: walletClient.transport as unknown as Transport,
            })

      return setPrimaryName(clientToUse as any, { name })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['getReverseResolution'] })
    },
  })

  const {
    setName: setReverseName,
    isPending: isSettingReverse,
    isSuccess: isReverseSuccess,
  } = useSetReverseName({
    coinType,
    isTestnet,
  })

  const { getSetAddressRequest, resolverAddress } = useSetForwardResolution({
    name: displayName || '',
    coinType,
  })

  // Forward resolution (name → address) transaction
  const {
    data: forwardHash,
    writeContract,
    isPending: isWritingForward,
    error: forwardError,
  } = useWriteContract()

  const { isLoading: isConfirmingForward, isSuccess: isForwardSuccess } =
    useWaitForTransactionReceipt({
      hash: forwardHash,
    })

  const setForwardResolution = (address: Address) => {
    // Only set forward resolution for L1 chains
    if (!isL1) {
      throw new Error('Forward resolution is only available for L1 chains')
    }
    const request = getSetAddressRequest(address)
    writeContract(request)
  }

  const isPendingL1 = l1SetPrimaryNameMutation.isPending
  const isPendingUpdate = isL1 ? isPendingL1 : isSettingReverse
  const isPendingForward = isWritingForward || isConfirmingForward

  useEffect(() => {
    if (isReverseSuccess || isForwardSuccess) {
      queryClient.invalidateQueries({ queryKey: ['getReverseResolution'] })
    }
  }, [isReverseSuccess, isForwardSuccess, queryClient])

  const setReverseNameMutation = (name: string) => {
    if (isL1) {
      l1SetPrimaryNameMutation.mutate(name)
    } else {
      setReverseName(name)
    }
  }

  return {
    isL1,
    isPendingUpdate,
    isPendingForward,
    setReverseNameMutation,
    setForwardResolution,
    forwardHash,
    forwardError,
    resolverAddress,
  }
}
