/**
 * Hook to get the resolver address for a name.
 *
 * Uses the version-agnostic getResolver which goes through
 * the UniversalResolver V2 contract on L1.
 */

import { fromSync, ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { getResolver } from '@ensdomains/ensjs/public'
import { registryResolverSnippet } from '@ensdomains/ensjs-abi/registry'
import { useQuery } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import { type Address, namehash, zeroAddress } from 'viem'
import { readContract } from 'viem/actions'
import { normalize } from 'viem/ens'
import { getAction } from 'viem/utils'
import { safeGetClient } from '@/lib/wagmi/helpers'

// ============================================================================
// Types
// ============================================================================

export type GetNameResolverAddressParams = {
  name: string
}

// ============================================================================
// Error
// ============================================================================

class GetNameResolverAddressError extends TaggedError(
  'GetNameResolverAddressError',
)<{
  cause: unknown
}> {}

// ============================================================================
// Pure function
// ============================================================================

/**
 * Get the resolver address for a name via the UniversalResolver.
 */
export const getNameResolverAddress = ResultFn(async function* (
  params: GetNameResolverAddressParams,
) {
  const { name } = params
  const client = yield* safeGetClient()

  const resolverAddress = yield* fromPromise(
    getResolver(client, { name }),
    (e) => new GetNameResolverAddressError({ cause: e }),
  )

  if (resolverAddress && resolverAddress !== zeroAddress) {
    return ok<Address | null>(resolverAddress)
  }

  // A lapsed ENSv1 name leaves the UniversalResolver walk when its v2
  // reservation expires, 28 days before its v1 grace ends, while the legacy
  // registry still names the resolver its owner is authorised to write.
  const node = yield* fromSync(
    () => namehash(normalize(name)),
    (e) => new GetNameResolverAddressError({ cause: e }),
  )

  const legacyResolver = yield* fromPromise(
    getAction(
      client,
      readContract,
      'readContract',
    )({
      address: getChainContractAddress({
        chain: client.chain,
        contract: 'ensLegacyRegistry',
      }),
      abi: registryResolverSnippet,
      functionName: 'resolver',
      args: [node],
    }),
    (e) => new GetNameResolverAddressError({ cause: e }),
  )

  return ok<Address | null>(
    legacyResolver && legacyResolver !== zeroAddress ? legacyResolver : null,
  )
})

// ============================================================================
// Query options
// ============================================================================

export const getNameResolverAddressQueryKey = createQueryKey<
  'get-name-resolver-address',
  GetNameResolverAddressParams
>('get-name-resolver-address')

export const getNameResolverAddressQueryOptions = (
  params: GetNameResolverAddressParams,
) =>
  resultQueryOptions({
    queryKey: getNameResolverAddressQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getNameResolverAddress(params),
  })

// ============================================================================
// Hook
// ============================================================================

export type UseNameResolverAddressParams = {
  name: string | undefined
}

/**
 * Hook to get the resolver address for a name.
 *
 * @param name - The ENS name (e.g., "myname.eth")
 * @returns Query result with resolver address or null
 */
export function useNameResolverAddress({ name }: UseNameResolverAddressParams) {
  return useQuery({
    ...getNameResolverAddressQueryOptions({
      name: name ?? '',
    }),
    enabled: !!name,
  })
}
