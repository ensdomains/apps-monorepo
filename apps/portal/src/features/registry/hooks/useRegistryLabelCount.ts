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

export type RegistryLabel = {
  name: string | null
  labelName: string | null
  labelhash: string | null
}

export type RegistrySummary = {
  labelCount: number
  createdAt: number
  labels: RegistryLabel[]
}

const LABELS_SAMPLE_SIZE = 20

const getRegistryLabelCount = ResultFn(async function* ({
  address,
}: GetRegistryLabelCountParameters) {
  const { registry } = yield* fromPromise(
    graphqlIndexerClient.request<{
      registry: {
        labelCount: number
        createdAt: number
        labels: RegistryLabel[]
      } | null
    }>(
      gql`
        query getRegistryLabelCount($address: String!, $first: Int!) {
          registry(address: $address) {
            labelCount
            createdAt
            labels(first: $first, orderBy: name, orderDirection: asc) {
              name
              labelName
              labelhash
            }
          }
        }
      `,
      { address: address.toLowerCase(), first: LABELS_SAMPLE_SIZE },
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
