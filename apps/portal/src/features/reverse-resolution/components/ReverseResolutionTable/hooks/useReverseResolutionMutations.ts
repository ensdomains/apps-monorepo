import type { CoinType } from '@ens-apps/abis/chains'
import {
  useSetForwardResolution,
  useSetReverseName,
} from '@ens-apps/abis/hooks'
import { setPrimaryName } from '@ensdomains/ensjs/wallet'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useWalletClient } from 'wagmi'

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
      // biome-ignore lint/suspicious/noExplicitAny: walletClient type needs to be cast for ENS.js setPrimaryName
      return setPrimaryName(walletClient as any, { name })
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
