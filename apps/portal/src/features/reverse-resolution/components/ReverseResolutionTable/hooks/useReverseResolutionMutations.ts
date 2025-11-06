import type { CoinType } from '@ens-apps/l2-primary/chains'
import {
  useSetForwardResolution,
  useSetReverseName,
} from '@ens-apps/l2-primary/hooks'
import { setPrimaryName } from '@ensdomains/ensjs/wallet'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { Client } from 'viem'
import { useWalletClient } from 'wagmi'
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
  const client: Client = wagmiConfig.getClient()
  const isL1 = Number(coinType) === 60 || Number(coinType) === 1

  const l1SetPrimaryNameMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!walletClient) throw new Error('Wallet client not found')
      return setPrimaryName(client, { name })
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

  const {
    setAddress,
    isPending: isSettingForward,
    isSuccess: isForwardSuccess,
  } = useSetForwardResolution({
    name: displayName || '',
    coinType,
  })

  const isPendingL1 = l1SetPrimaryNameMutation.isPending
  const isPendingUpdate = isL1 ? isPendingL1 : isSettingReverse

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
    isSettingForward,
    setReverseNameMutation,
    setForwardResolutionMutation: setAddress,
  }
}
