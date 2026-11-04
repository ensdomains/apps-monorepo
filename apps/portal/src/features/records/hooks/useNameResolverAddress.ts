/**
 * Hook to get the resolver address for a name.
 *
 * Uses the version-agnostic getResolver which goes through
 * the UniversalResolver V2 contract on L1.
 */

import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getResolver } from '@ensdomains/ensjs/public'
import { useQuery } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import { type Address, zeroAddress } from 'viem'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { getLegacyRegistryResolver } from '@/utils/ens/getLegacyRegistryResolver'
import { resolveV2EthOwner } from '@/utils/ens/resolveEnsOwner'

// ============================================================================
// Types
// ============================================================================

export type GetNameResolverAddressParams = {
  name: string
}

/** `v1-registry`: lookups no longer reach it, so records written there don't resolve. */
export type NameResolver = {
  readonly address: Address
  readonly source: 'lookup' | 'v1-registry'
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
 * Get the resolver for a name via the UniversalResolver.
 */
export const getNameResolver = ResultFn(async function* (
  params: GetNameResolverAddressParams,
) {
  const { name } = params
  const client = yield* safeGetClient()

  const resolverAddress = yield* fromPromise(
    getResolver(client, { name }),
    (e) => new GetNameResolverAddressError({ cause: e }),
  )

  if (resolverAddress && resolverAddress !== zeroAddress) {
    return ok<NameResolver | null>({
      address: resolverAddress,
      source: 'lookup',
    })
  }

  // A V2 name with no resolver has none; its leftover V1 entry is stale.
  if (name.endsWith('.eth')) {
    const v2Owner = yield* fromPromise(
      resolveV2EthOwner(client, name),
      (e) => new GetNameResolverAddressError({ cause: e }),
    )
    if (v2Owner) return ok<NameResolver | null>(null)
  }

  // A lapsed ENSv1 name leaves the UniversalResolver walk when its v2
  // reservation expires, while the legacy registry still names its resolver.
  const legacyResolver = yield* fromPromise(
    getLegacyRegistryResolver(client, name),
    (e) => new GetNameResolverAddressError({ cause: e }),
  )

  return ok<NameResolver | null>(
    legacyResolver ? { address: legacyResolver, source: 'v1-registry' } : null,
  )
})

// ============================================================================
// Query options
// ============================================================================

export const getNameResolverAddressQueryKey = createQueryKey<
  'get-name-resolver-address',
  GetNameResolverAddressParams
>('get-name-resolver-address')

export const getNameResolverQueryOptions = (
  params: GetNameResolverAddressParams,
) =>
  resultQueryOptions({
    queryKey: getNameResolverAddressQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getNameResolver(params),
  })

export const getNameResolverAddressQueryOptions = (
  params: GetNameResolverAddressParams,
) => ({
  ...getNameResolverQueryOptions(params),
  select: (resolver: NameResolver | null) => resolver?.address ?? null,
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
