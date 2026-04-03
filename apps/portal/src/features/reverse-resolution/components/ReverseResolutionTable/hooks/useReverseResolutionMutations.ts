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
import { useConnection, useWalletClient } from 'wagmi'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getNameResolverAddressQueryOptions } from '@/features/records/hooks/useNameResolverAddress'
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

  // Determine which network the name lives on (V1 sepolia vs V2 namechainSepolia)
  const { data: ownerData } = useQuery({
    ...getEnsOwnerQueryOptions({ name: displayName }),
    enabled: isL1 && Boolean(displayName),
  })

  const nameNetwork = ownerData?.network

  // Get resolver address from the correct registry (V1 or V2)
  const { data: resolverAddress } = useQuery({
    ...getNameResolverAddressQueryOptions({
      name: displayName ?? '',
      network: nameNetwork ?? 'sepolia',
    }),
    enabled: isL1 && Boolean(displayName) && Boolean(nameNetwork),
  })

  const { data: isDedicatedResolver = false } = useQuery({
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
    getReverseResolutionRequest,
    getForwardResolutionRequest,
    invalidateReverseResolutionQuery,
  }
}
