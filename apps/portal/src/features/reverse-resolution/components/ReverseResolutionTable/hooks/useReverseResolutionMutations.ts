import type { CoinType } from '@ens-apps/l2-primary/chains'
import {
  useSetForwardResolution,
  useSetReverseName,
} from '@ens-apps/l2-primary/hooks'
import type { ChainWithEns } from '@ensdomains/ensjs/chain'
import { setPrimaryName } from '@ensdomains/ensjs/wallet'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo } from 'react'
import type { Address } from 'viem'
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
  isTestnet: _isTestnet, // not needed for now until we enable mainnet
  displayName,
}: UseReverseResolutionMutationsParams) {
  const queryClient = useQueryClient()

  // L1 means Ethereum (coinType 60). We only use Sepolia for L1 here.
  const isL1 = useMemo(() => Number(coinType) === 60, [coinType])

  const { data: l1WalletClient } = useWalletClient({ chainId: sepolia.id })

  const ensChain = wagmiConfig.chains.find((c) => c.id === sepolia.id)
  const ensEnabledChain = ensChain as ChainWithEns<typeof sepolia>

  /*
    // If we enable mainnet we reintroduce this code
    const l1ChainBase = isTestnet ? sepolia : mainnet
    const { data: l1WalletClient } = useWalletClient({ chainId: l1ChainBase.id })
    const ensEnabledChain = ensChain as ChainWithEns<typeof l1ChainBase>
  */

  const l1SetPrimaryNameMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!l1WalletClient)
        throw new Error('Sepolia wallet client not available')
      if (!l1WalletClient.account) throw new Error('No connected account')
      if (!ensEnabledChain) throw new Error('Sepolia chain missing in config')

      const client = { ...l1WalletClient, chain: ensEnabledChain }
      return setPrimaryName(client, { name })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['getReverseResolution'] })
    },
  })

  // L2 Reverse Name (address -> name)
  const { getSetReverseNameRequest } = useSetReverseName({
    coinType,
    isTestnet: true, // if you’re sep only, it’s testnet by definition
  })

  // Forward Resolution (name -> address) on L1 only
  const { getSetAddressRequest, resolverAddress } = useSetForwardResolution({
    name: displayName || '',
    coinType,
  })

  const {
    data: reverseHashSetName,
    writeContract: writeReverseSetName,
    isPending: isWritingReverseSetName,
    error: reverseErrorSetName,
  } = useWriteContract()

  const {
    data: reverseHashSetNameForAddr,
    writeContract: writeReverseSetNameForAddr,
    isPending: isWritingReverseSetNameForAddr,
    error: reverseErrorSetNameForAddr,
  } = useWriteContract()

  const reverseHash = reverseHashSetName ?? reverseHashSetNameForAddr
  const reverseError = reverseErrorSetName ?? reverseErrorSetNameForAddr
  const isWritingReverse =
    isWritingReverseSetName || isWritingReverseSetNameForAddr

  const { isLoading: isConfirmingReverse, isSuccess: isReverseSuccess } =
    useWaitForTransactionReceipt({ hash: reverseHash })

  const {
    data: forwardHash,
    writeContract: writeForwardContract,
    isPending: isWritingForward,
    error: forwardError,
  } = useWriteContract()

  const { isLoading: isConfirmingForward, isSuccess: isForwardSuccess } =
    useWaitForTransactionReceipt({ hash: forwardHash })

  const setReverseResolution = useCallback(
    (name: string) => {
      const request = getSetReverseNameRequest(name)
      if (request.functionName === 'setName') {
        writeReverseSetName(request)
      } else if (request.functionName === 'setNameForAddr') {
        writeReverseSetNameForAddr(request)
      } else {
        throw new Error('Unsupported reverse function')
      }
    },
    [getSetReverseNameRequest, writeReverseSetName, writeReverseSetNameForAddr],
  )

  const setForwardResolution = useCallback(
    (address: Address) => {
      if (!isL1)
        throw new Error('Forward resolution is only for Ethereum (coinType 60)')
      if (!resolverAddress) throw new Error('Resolver not found for this name')

      const request = getSetAddressRequest(address)
      writeForwardContract(request)
    },
    [getSetAddressRequest, isL1, resolverAddress, writeForwardContract],
  )

  const isPendingL1 = l1SetPrimaryNameMutation.isPending
  const isPendingReverse = isWritingReverse || isConfirmingReverse
  const isPendingUpdate = isL1 ? isPendingL1 : isPendingReverse
  const isPendingForward = isWritingForward || isConfirmingForward

  useEffect(() => {
    if (isReverseSuccess || isForwardSuccess) {
      queryClient.invalidateQueries({ queryKey: ['getReverseResolution'] })
    }
  }, [isReverseSuccess, isForwardSuccess, queryClient])

  const setReverseNameMutation = useCallback(
    (name: string) => {
      if (isL1) l1SetPrimaryNameMutation.mutate(name)
      else setReverseResolution(name)
    },
    [isL1, l1SetPrimaryNameMutation, setReverseResolution],
  )

  return {
    isL1,
    isPendingUpdate,
    isPendingForward,
    setReverseNameMutation,
    setForwardResolution,
    reverseHash,
    reverseError,
    forwardHash,
    forwardError,
    resolverAddress,
  }
}
