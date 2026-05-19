import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { type ClientError, gql } from 'graphql-request'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { graphqlIndexerClient } from '@/lib/indexer'

class GetRegistryLabelCountError extends TaggedError(
  'GetRegistryLabelCountError',
)<{
  cause: ClientError
}> {}

type GetRegistryLabelCountParameters = {
  address: Address
}

export type RegistrySummary = {
  labelCount: number
  createdAt: number
}

const getRegistryLabelCount = ResultFn(async function* ({
  address,
}: GetRegistryLabelCountParameters) {
  const { registry } = yield* fromPromise(
    graphqlIndexerClient.request<{
      registry: { labelCount: number; createdAt: number } | null
    }>(
      gql`
        query getRegistryLabelCount($address: String!) {
          registry(address: $address) {
            labelCount
            createdAt
          }
        }
      `,
      { address: address.toLowerCase() },
    ),
    (e) => new GetRegistryLabelCountError({ cause: e as ClientError }),
  )

  // null = indexer has no record for this registry address (not yet indexed,
  // or contract doesn't exist). Distinct from a registry with 0 labels.
  return ok(registry as RegistrySummary | null)
})

const getRegistryLabelCountQueryKey = createQueryKey<
  'get-registry-label-count',
  GetRegistryLabelCountParameters
>('get-registry-label-count')

export const getRegistryLabelCountQueryOptions = (
  params: GetRegistryLabelCountParameters,
) =>
  resultQueryOptions({
    queryKey: getRegistryLabelCountQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getRegistryLabelCount(params),
  })
