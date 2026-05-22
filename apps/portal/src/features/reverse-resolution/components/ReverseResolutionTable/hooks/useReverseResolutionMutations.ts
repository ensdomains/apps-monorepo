import {
  createSetForwardResolutionRequest,
  createSetReverseNameRequest,
  type SetForwardResolutionRequest,
  type SetReverseNameRequest,
} from '@ens-apps/l2-primary/utils'
import {
  getRegistrarAddress,
  type ReverseRegistrarChainId,
} from '@ens-apps/l2-primary/v1'
import { reverseRegistrarSetNameSnippet } from '@ensdomains/ensjs-abi/reverseRegistrar'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import type { Address } from 'viem'
import { useConnection, useWalletClient } from 'wagmi'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getNameResolverAddressQueryOptions } from '@/features/records/hooks/useNameResolverAddress'
import { isL1ReverseRegistrarChainId } from '@/lib/reverseRegistrarChainId'

type UseReverseResolutionMutationsParams = {
  reverseRegistrarChainId: ReverseRegistrarChainId
  displayName: string | undefined
  reverseNameInput: string | undefined
}

type ReverseResolutionWriteRequest =
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

  const { data: l1WalletClient } = useWalletClient()

  const { isLoading: isEnsOwnerLoading } = useQuery({
    ...getEnsOwnerQueryOptions({ name: displayName }),
    enabled: Boolean(displayName),
  })

  // The ENS owner lookup only matters for the L1 path — the L1 sidebar UX
  // treats "primary name" as an ENS name and we currently issue the lookup
  // to detect whether the name actually exists before allowing setName.
  // L2 `setName(string)` accepts any string (ENSv1, ENSv2, subname, DNS-
  // imported), so we don't gate L2 input on the ENS registry at all and
  // skip the query entirely.
  const isValidReverseInput =
    isL1 &&
    Boolean(reverseNameInput) &&
    (reverseNameInput?.endsWith('.eth') ?? false)

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

        if (reverseInputProtocolVersion === undefined) {
          return {
            kind: 'unsupported',
            reason: 'Name does not exist',
          }
        }

        // Reverse registration on L1 uses the ENSv1 `ReverseRegistrar` for
        // all names. There is no separate ENSv2 reverse registrar — ENSv2
        // names (including ENSv2-only names in `ETHRegistry`) set their
        // reverse record through the same ENSv1 contract.
        return {
          kind: 'l1-v1-direct',
          request: {
            // biome-ignore lint/style/noNonNullAssertion: coinType 60 always has a sepolia address
            address: getRegistrarAddress(60)!,
            abi: reverseRegistrarSetNameSnippet,
            functionName: 'setName',
            args: [name] as const,
          },
        }
      }

      // L2 primaries always go through the ENSv1 `L2ReverseRegistrar`,
      // regardless of whether the name itself is ENSv1 or ENSv2. There is
      // no ENSv2 reverse registrar — neither on L1 nor on L2 — so reverse
      // resolution is uniformly an ENSv1-contract concern. The registrar
      // stores `setName(string)` verbatim and doesn't care about the name's
      // provenance. Forward resolution back to the address is handled by
      // the per-chain reverse resolver on L1 (e.g. `BaseReverseResolver`),
      // which walks whichever registry owns the name.
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
