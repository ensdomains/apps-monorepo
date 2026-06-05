import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { type ClientError, gql } from 'graphql-request'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
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
  referencedBy: { name: string | null }[]
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
            referencedBy {
              name
            }
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
