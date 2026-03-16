import type { ReverseRegistrarChainId } from '@ens-apps/l2-primary/reverseRegistrarChainIds'
import {
  createSetForwardResolutionRequest,
  createSetReverseNameRequest,
  type SetForwardResolutionRequest,
  type SetReverseNameRequest,
} from '@ens-apps/l2-primary/utils'
import {
  type SetPrimaryNameWriteParametersReturnType,
  setPrimaryNameWriteParameters,
} from '@ensdomains/ensjs/wallet'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import type { Address } from 'viem'
import { zeroAddress } from 'viem'
import { sepolia } from 'viem/chains'
import { useConnection, useEnsResolver, useWalletClient } from 'wagmi'
import { getIsDedicatedResolverQueryOptions } from '@/features/resolver/hooks/useIsDedicatedResolver'
import { isL1ReverseRegistrarChainId } from '@/lib/reverseRegistrarChainId'
import { sepoliaWithEns } from '@/lib/wagmi'

type UseReverseResolutionMutationsParams = {
  reverseRegistrarChainId: ReverseRegistrarChainId
  displayName: string | undefined
}

type ReverseResolutionWriteRequest =
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
  const { chain } = useConnection()

  // L1 means Ethereum (reverseRegistrarChainId 1 or 60). We only use Sepolia for L1 here.
  const isL1 = useMemo(
    () => isL1ReverseRegistrarChainId(reverseRegistrarChainId),
    [reverseRegistrarChainId],
  )

  const { data: l1WalletClient } = useWalletClient({ chainId: sepolia.id })

  // Get resolver address for forward resolution (L1 only)
  const { data: resolverAddress } = useEnsResolver({
    name: displayName,
    chainId: sepolia.id,
    query: { enabled: isL1 && Boolean(displayName) },
  })

  const { data: isDedicatedResolver } = useQuery({
    ...getIsDedicatedResolverQueryOptions({
      resolverAddress: resolverAddress ?? zeroAddress,
    }),
    enabled: Boolean(resolverAddress),
  })

  const invalidateReverseResolutionQuery = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['get-reverse-resolution'] })
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
        request: createSetReverseNameRequest({
          name,
          reverseRegistrarChainId,
          chain,
        }),
      }
    },
    [chain, isL1, l1WalletClient, reverseRegistrarChainId],
  )

  const getForwardResolutionRequest = useCallback(
    (address: Address): SetForwardResolutionRequest => {
      if (!isL1)
        throw new Error(
          'Forward resolution is only for Ethereum (reverseRegistrarChainId 60)',
        )

      if (typeof isDedicatedResolver !== 'boolean') {
        throw new Error(
          'Resolver type must be known before setting forward resolution.',
        )
      }

      return createSetForwardResolutionRequest({
        name: displayName,
        reverseRegistrarChainId,
        resolverAddress,
        targetAddress: address,
        isDedicatedResolver,
      })
    },
    [
      displayName,
      isDedicatedResolver,
      isL1,
      resolverAddress,
      reverseRegistrarChainId,
    ],
  )

  return {
    isL1,
    resolverAddress,
    isDedicatedResolver,
    getReverseResolutionRequest,
    getForwardResolutionRequest,
    invalidateReverseResolutionQuery,
  }
}
