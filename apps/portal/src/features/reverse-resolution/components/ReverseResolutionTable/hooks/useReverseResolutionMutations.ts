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
import { type Address, isAddressEqual } from 'viem'
import { normalize } from 'viem/ens'
import { useConnection, useWalletClient } from 'wagmi'
import { config } from '@/config'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getNameResolverAddressQueryOptions } from '@/features/records/hooks/useNameResolverAddress'
import { getIsPermissionedResolverQueryOptions } from '@/features/resolver/hooks/useIsPermissionedResolver'
import { isL1ReverseRegistrarChainId } from '@/lib/reverseRegistrarChainId'

type UseReverseResolutionMutationsParams = {
  reverseRegistrarChainId: ReverseRegistrarChainId
  /**
   * ENSIP-9/11 coin type of the selected row (`60`, `0x80000000 | l2ChainId`,
   * …) — the coin the forward `addr(node, coinType)` record is keyed on.
   */
  coinType: number
  displayName: string | undefined
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

export function useReverseResolutionMutations({
  reverseRegistrarChainId,
  coinType,
  displayName,
}: UseReverseResolutionMutationsParams) {
  const queryClient = useQueryClient()
  const { address: connectedAddress } = useConnection()

  const isL1 = useMemo(
    () => isL1ReverseRegistrarChainId(reverseRegistrarChainId),
    [reverseRegistrarChainId],
  )

  const { data: l1WalletClient } = useWalletClient()

  const { isLoading: isEnsOwnerLoading } = useQuery({
    ...getEnsOwnerQueryOptions({ name: displayName }),
    enabled: Boolean(displayName),
  })

  // The name's resolver lives on L1 for every row — L2 forward records
  // (`addr(node, l2CoinType)`) are set on the same L1 resolver as coin 60.
  const { data: resolverAddress } = useQuery({
    ...getNameResolverAddressQueryOptions({
      name: displayName ?? '',
    }),
    enabled: Boolean(displayName),
  })

  // Post-audit-2 `PermissionedResolver` setters take the DNS-encoded name;
  // legacy resolvers take the node. Decide by the resolver's implementation —
  // never by a default, since the wrong encoding hits the other resolver's
  // fallback and reverts with empty data.
  const {
    data: isPermissionedResolver,
    isPending: isResolverKindPending,
    isError: isResolverKindError,
  } = useQuery({
    ...getIsPermissionedResolverQueryOptions({
      resolverAddress: (resolverAddress ??
        '0x0000000000000000000000000000000000000000') as Address,
    }),
    enabled: Boolean(resolverAddress),
  })

  /** True until we know which setter shape this resolver takes. */
  const isResolverKindLoading =
    Boolean(resolverAddress) && isResolverKindPending

  const invalidateReverseResolutionQuery = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['get-reverse-resolution'] })
  }, [queryClient])

  // Reverse resolution always goes through the ENSv1 `ReverseRegistrar` on
  // L1 and the ENSv1 `L2ReverseRegistrar` on L2 — both accept `setName(string)`
  // for any UTF-8 string (V1 name, V2 name, subname, DNS-imported, even
  // a non-existent name), so we don't gate the input on existence or
  // protocol version at all.
  const getReverseResolutionRequest = useCallback(
    (name: string): ReverseResolutionWriteRequest => {
      const normalizedName = normalize(name)

      if (isL1) {
        if (!l1WalletClient)
          throw new Error('Sepolia wallet client not available')
        if (!l1WalletClient.account) throw new Error('No connected account')

        return {
          kind: 'l1-v1-direct',
          request: {
            // biome-ignore lint/style/noNonNullAssertion: coinType 60 always has an L1 registrar
            address: getRegistrarAddress(60, config.network)!,
            abi: reverseRegistrarSetNameSnippet,
            functionName: 'setName',
            args: [normalizedName] as const,
          },
        }
      }

      // No `targetAddress`: that would select `setNameForAddr`. Both branches
      // deliberately use `setName(string)`, which writes the signer's own
      // reverse record, so there is no target here to point at the wrong
      // address in the first place.
      return {
        kind: 'l2',
        request: createSetReverseNameRequest({
          name: normalizedName,
          reverseRegistrarChainId,
          // The network is a property of the build, not of whichever L2 the
          // wallet happens to be connected to.
          network: config.network,
        }),
      }
    },
    [isL1, l1WalletClient, reverseRegistrarChainId],
  )

  // Builds the forward address-record request against the name's L1 resolver
  // (`setAddr(node, ...)` on legacy resolvers, `setAddress(name, ...)` on a
  // post-audit-2 PermissionedResolver). Valid for L1 and L2 rows alike — the
  // coin type keys which chain's address record is written (ENSIP-19), the tx
  // itself is always an L1 transaction.
  //
  // The record is always written for the connected account. Callers pass the
  // account they believe they are acting for and the builder refuses anything
  // else, so the rule holds here rather than in whichever component happens to
  // render the trigger: `setAddr` decides which address the name resolves to,
  // and pointing it at an address that is not the signer hands the name to a
  // third party.
  const getForwardResolutionRequest = useCallback(
    (targetAddress: Address): SetForwardResolutionRequest => {
      if (!connectedAddress) {
        throw new Error('Connect a wallet to set a primary name.')
      }
      if (!isAddressEqual(targetAddress, connectedAddress)) {
        throw new Error(
          'A primary name can only be set for the connected wallet.',
        )
      }
      if (isResolverKindError) {
        throw new Error(
          'Could not determine the resolver type. Refresh and try again.',
        )
      }
      if (isResolverKindLoading) {
        throw new Error('Still checking the resolver type. Try again shortly.')
      }

      return createSetForwardResolutionRequest({
        name: displayName,
        coinType,
        resolverAddress,
        targetAddress: connectedAddress,
        permissioned: isPermissionedResolver === true,
      })
    },
    [
      connectedAddress,
      displayName,
      coinType,
      resolverAddress,
      isPermissionedResolver,
      isResolverKindLoading,
      isResolverKindError,
    ],
  )

  return {
    getReverseResolutionRequest,
    getForwardResolutionRequest,
    invalidateReverseResolutionQuery,
    isEnsOwnerLoading,
    isResolverKindLoading,
  }
}
