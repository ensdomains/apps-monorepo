import type {
  SetForwardResolutionRequest,
  SetReverseNameRequest,
} from '@ens-apps/l2-primary/hooks'
import {
  useSetForwardResolution,
  useSetReverseName,
} from '@ens-apps/l2-primary/hooks'
import type { ReverseRegistrarCoinId } from '@ens-apps/l2-primary/reverseRegistrarCoinIds'
import type { ChainWithEns } from '@ensdomains/ensjs/chain'
import {
  type SetPrimaryNameWriteParametersReturnType,
  setPrimaryNameWriteParameters,
} from '@ensdomains/ensjs/wallet'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import type { Address } from 'viem'
import { sepolia } from 'viem/chains'
import { useWalletClient } from 'wagmi'
import { wagmiConfig } from '@/lib/wagmi'

export type UseReverseResolutionMutationsParams = {
  reverseRegistrarCoinId: ReverseRegistrarCoinId
  displayName: string | null
}

export type ReverseResolutionWriteRequest =
  | {
      kind: 'l1'
      request: SetPrimaryNameWriteParametersReturnType
    }
  | {
      kind: 'l2'
      request: SetReverseNameRequest
    }

export function useReverseResolutionMutations({
  reverseRegistrarCoinId,
  displayName,
}: UseReverseResolutionMutationsParams) {
  const queryClient = useQueryClient()

  // L1 means Ethereum (reverseRegistrarCoinId 60). We only use Sepolia for L1 here.
  const isL1 = useMemo(
    () => Number(reverseRegistrarCoinId) === 60,
    [reverseRegistrarCoinId],
  )

  const { data: l1WalletClient } = useWalletClient({ chainId: sepolia.id })
  const ensChain = wagmiConfig.chains.find((c) => c.id === sepolia.id)
  const ensEnabledChain = ensChain as ChainWithEns<typeof sepolia>

  // L2 Reverse Name (address -> name)
  const { getSetReverseNameRequest } = useSetReverseName({
    reverseRegistrarCoinId,
    chain: ensEnabledChain, // pass ENS-enabled chain instead of isTestnet
  })

  // Forward Resolution (name -> address) on L1 only
  const { getSetAddressRequest, resolverAddress } = useSetForwardResolution({
    name: displayName || '',
    reverseRegistrarCoinId,
  })

  const invalidateReverseResolutionQuery = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['getReverseResolution'] })
  }, [queryClient])

  const getReverseResolutionRequest = useCallback(
    (name: string): ReverseResolutionWriteRequest => {
      if (isL1) {
        if (!l1WalletClient)
          throw new Error('Sepolia wallet client not available')
        if (!l1WalletClient.account) throw new Error('No connected account')
        if (!ensEnabledChain) throw new Error('Sepolia chain missing in config')

        const client = {
          ...l1WalletClient,
          chain: ensEnabledChain,
        }

        return {
          kind: 'l1',
          request: setPrimaryNameWriteParameters(client, { name }),
        }
      }

      return {
        kind: 'l2',
        request: getSetReverseNameRequest(name),
      }
    },
    [ensEnabledChain, getSetReverseNameRequest, isL1, l1WalletClient],
  )

  const getForwardResolutionRequest = useCallback(
    (address: Address): SetForwardResolutionRequest => {
      if (!isL1)
        throw new Error(
          'Forward resolution is only for Ethereum (reverseRegistrarCoinId 60)',
        )
      if (!resolverAddress) throw new Error('Resolver not found for this name')

      return getSetAddressRequest(address)
    },
    [getSetAddressRequest, isL1, resolverAddress],
  )

  return {
    isL1,
    resolverAddress,
    getReverseResolutionRequest,
    getForwardResolutionRequest,
    invalidateReverseResolutionQuery,
  }
}
