import {
  createSetForwardResolutionRequest,
  createSetReverseNameRequest,
  type SetForwardResolutionRequest,
  type SetReverseNameRequest,
} from '@ens-apps/l2-primary/utils'
import type { ReverseRegistrarChainId } from '@ens-apps/l2-primary/v1'
import { L1_REGISTRARS } from '@ens-apps/l2-primary/v2'
import {
  type SetPrimaryNameWriteParametersReturnType,
  setPrimaryNameWriteParameters,
} from '@ensdomains/ensjs/wallet'
import { reverseRegistrarSetNameSnippet } from '@ensdomains/ensjs-abi/reverseRegistrar'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import type { Address } from 'viem'
import { sepolia } from 'viem/chains'
import { useConnection, useWalletClient } from 'wagmi'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getNameResolverAddressQueryOptions } from '@/features/records/hooks/useNameResolverAddress'
import { isL1ReverseRegistrarChainId } from '@/lib/reverseRegistrarChainId'
import { sepoliaWithEns } from '@/lib/wagmi'

type UseReverseResolutionMutationsParams = {
  reverseRegistrarChainId: ReverseRegistrarChainId
  displayName: string | undefined
  reverseNameInput: string | undefined
}

type ReverseResolutionWriteRequest =
  | {
      kind: 'l1'
      request: SetPrimaryNameWriteParametersReturnType
    }
  | {
      kind: 'l1-v1-direct'
      request: {
        address: Address
        abi: typeof reverseRegistrarSetNameSnippet
        functionName: 'setName'
        args: readonly [name: string]
      }
    }
  | {
      kind: 'l2'
      request: SetReverseNameRequest
    }
  | {
      kind: 'unsupported'
      reason: string
    }

export function useReverseResolutionMutations({
  reverseRegistrarChainId,
  displayName,
  reverseNameInput,
}: UseReverseResolutionMutationsParams) {
  const queryClient = useQueryClient()
  const { chain } = useConnection()

  const isL1 = useMemo(
    () => isL1ReverseRegistrarChainId(reverseRegistrarChainId),
    [reverseRegistrarChainId],
  )

  const { data: l1WalletClient } = useWalletClient({ chainId: sepolia.id })

  const { isLoading: isEnsOwnerLoading } = useQuery({
    ...getEnsOwnerQueryOptions({ name: displayName }),
    enabled: Boolean(displayName),
  })

  const isValidReverseInput =
    Boolean(reverseNameInput) && reverseNameInput!.endsWith('.eth')

  const { data: reverseInputOwner, isLoading: isReverseInputOwnerLoading } =
    useQuery({
      ...getEnsOwnerQueryOptions({ name: reverseNameInput }),
      enabled: isValidReverseInput,
    })

  const reverseInputProtocolVersion = reverseInputOwner?.protocolVersion

  const { data: resolverAddress } = useQuery({
    ...getNameResolverAddressQueryOptions({
      name: displayName ?? '',
    }),
    enabled: isL1 && Boolean(displayName),
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

        if (reverseInputProtocolVersion === 'ENSv1') {
          return {
            kind: 'l1-v1-direct',
            request: {
              address: L1_REGISTRARS.ENSv1,
              abi: reverseRegistrarSetNameSnippet,
              functionName: 'setName',
              args: [name] as const,
            },
          }
        }

        if (reverseInputProtocolVersion === undefined) {
          return {
            kind: 'unsupported',
            reason: 'Name does not exist',
          }
        }

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

      if (reverseInputProtocolVersion === 'ENSv2') {
        return {
          kind: 'unsupported',
          reason: 'ENSv2 names do not support L2 primary names yet',
        }
      }

      if (reverseInputProtocolVersion === undefined) {
        return {
          kind: 'unsupported',
          reason: 'Name does not exist',
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
    [
      chain,
      isL1,
      l1WalletClient,
      reverseInputProtocolVersion,
      reverseRegistrarChainId,
    ],
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
      })
    },
    [displayName, isL1, resolverAddress, reverseRegistrarChainId],
  )

  return {
    getReverseResolutionRequest,
    getForwardResolutionRequest,
    invalidateReverseResolutionQuery,
    isEnsOwnerLoading,
    isReverseInputOwnerLoading,
  }
}
