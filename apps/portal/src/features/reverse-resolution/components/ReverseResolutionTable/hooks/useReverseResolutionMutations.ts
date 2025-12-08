import type {
  SetForwardResolutionRequest,
  SetReverseNameRequest,
} from '@ens-apps/l2-primary/hooks'
import {
  useSetForwardResolution,
  useSetReverseName,
} from '@ens-apps/l2-primary/hooks'
import type { ReverseRegistrarChainId } from '@ens-apps/l2-primary/reverseRegistrarChainIds'
import {
  type SetPrimaryNameWriteParametersReturnType,
  setPrimaryNameWriteParameters,
} from '@ensdomains/ensjs/wallet'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import type { Address } from 'viem'
import { sepolia } from 'viem/chains'
import { useWalletClient } from 'wagmi'
import { isL1ReverseRegistrarChainId } from '@/lib/reverseRegistrarChainId'
import { sepoliaWithEns } from '@/lib/wagmi'

export type UseReverseResolutionMutationsParams = {
  reverseRegistrarChainId: ReverseRegistrarChainId
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
  reverseRegistrarChainId,
  displayName,
}: UseReverseResolutionMutationsParams) {
  const queryClient = useQueryClient()

  // L1 means Ethereum (reverseRegistrarChainId 1 or 60). We only use Sepolia for L1 here.
  const isL1 = useMemo(
    () => isL1ReverseRegistrarChainId(reverseRegistrarChainId),
    [reverseRegistrarChainId],
  )

  const { data: l1WalletClient } = useWalletClient({ chainId: sepolia.id })

  // L2 Reverse Name (address -> name)
  const { getSetReverseNameRequest } = useSetReverseName({
    reverseRegistrarChainId,
  })

  // Forward Resolution (name -> address) on L1 only
  const { getSetAddressRequest, resolverAddress } = useSetForwardResolution({
    name: displayName || '',
    reverseRegistrarChainId,
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

        return {
          kind: 'l1',
          request: setPrimaryNameWriteParameters(
            {
              ...l1WalletClient,
              chain: sepoliaWithEns,
            },
            { name },
          ),
        }
      }

      return {
        kind: 'l2',
        request: getSetReverseNameRequest(name),
      }
    },
    [getSetReverseNameRequest, isL1, l1WalletClient],
  )

  const getForwardResolutionRequest = useCallback(
    (address: Address): SetForwardResolutionRequest => {
      if (!isL1)
        throw new Error(
          'Forward resolution is only for Ethereum (reverseRegistrarChainId 60)',
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
