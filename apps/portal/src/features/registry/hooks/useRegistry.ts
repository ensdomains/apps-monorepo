import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQuery } from '@tanstack/react-query'
import { type ClientError, gql } from 'graphql-request'
import { fromPromise, ok } from 'neverthrow'
import { type Address, isAddressEqual, zeroAddress } from 'viem'
import { graphqlIndexerClient } from '@/lib/indexer'

class GetRegistryError extends TaggedError('GetRegistryError')<{
  cause: ClientError
}> {}

type GetRegistryParameters = {
  address: Address
}

export type Registry = {
  address: Address
  /** This registry's own ENS name (e.g. "eth"); empty for the root. */
  name: string
  namehash: string
  /** Address of the parent registry (zero address for the root). */
  parentRegistry: Address
  createdBlock: number
  createdAt: number
  labelCount: number
  roleCount: number
  eventCount: number
}

const getRegistry = ResultFn(async function* ({
  address,
}: GetRegistryParameters) {
  const { registry } = yield* fromPromise(
    graphqlIndexerClient.request<{ registry: Registry | null }>(
      gql`
        query getRegistry($address: String!) {
          registry(address: $address) {
            address
            name
            namehash
            parentRegistry
            createdBlock
            createdAt
            labelCount
            roleCount
            eventCount
          }
        }
      `,
      { address: address.toLowerCase() },
    ),
    (e) => new GetRegistryError({ cause: e as ClientError }),
  )

  // null = indexer has no record for this address (not a registry, or not yet
  // indexed). Distinct from a registry with zero labels/roles.
  return ok(registry)
})

const getRegistryQueryKey = createQueryKey<
  'get-registry',
  GetRegistryParameters
>('get-registry')

export const getRegistryQueryOptions = (params: GetRegistryParameters) =>
  resultQueryOptions({
    queryKey: getRegistryQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getRegistry(params),
  })

export const useRegistry = (address: Address, enabled = true) =>
  useQuery({ ...getRegistryQueryOptions({ address }), enabled })

/**
 * Resolve the parent registry's name. `parentRegistry` only gives the parent's
 * address, so this is a dependent lookup. Disabled for the root (zero address).
 */
export const useParentRegistry = (parentRegistry: Address | undefined) =>
  useQuery({
    ...getRegistryQueryOptions({ address: parentRegistry ?? zeroAddress }),
    enabled: !!parentRegistry && !isAddressEqual(parentRegistry, zeroAddress),
  })

export type ReferencingName = {
  name: string
}

/**
 * Names whose current subregistry points at this registry contract.
 *
 * STUB: not resolvable from the indexer yet — there is no `subregistry` filter
 * on names, and the link only lives inside `SubregistryUpdated` event `data`
 * (a JSON blob, not server-filterable). Returns an empty list until the indexer
 * adds a `referencedBy` field to `RegistryInfo`.
 * See memory: project-registry-dashboard-data.
 */
export const useRegistryReferencedBy = (_address: Address) => {
  return {
    data: [] as ReferencingName[],
    isPending: false,
    isStub: true as const,
  }
}
