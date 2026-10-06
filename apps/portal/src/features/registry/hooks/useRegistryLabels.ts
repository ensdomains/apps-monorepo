import type { GraphqlRequestError } from '@ens-apps/indexer/urql'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultInfiniteQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { gql } from '@urql/core'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { graphqlIndexerClient } from '@/lib/indexer'

class GetRegistryLabelsError extends TaggedError('GetRegistryLabelsError')<{
  cause: GraphqlRequestError
}> {}

type GetRegistryLabelsParameters = {
  address: Address
}

export type RegistryLabelRow = {
  /** Full ENS name (e.g. "lmao.chakri.eth"); null if the label isn't reachable. */
  name: string | null
  /** The label segment (e.g. "lmao"); null when unnormalized. */
  labelName: string | null
  labelhash: string
  /** Unix seconds; null/0 means the label does not expire. */
  expiryDate: number | null
  /** Distinct accounts holding any label-scoped role on this label. */
  roleHoldersCount: number
}

export type RegistryLabelsPage = {
  readonly labels: readonly RegistryLabelRow[]
  readonly totalCount: number
  readonly endCursor: string | null
  readonly hasNextPage: boolean
}

export const REGISTRY_LABELS_PAGE_SIZE = 100

const getRegistryLabelsPage = ResultFn(async function* ({
  address,
  after,
}: GetRegistryLabelsParameters & { readonly after: string | undefined }) {
  const { registry } = yield* fromPromise(
    graphqlIndexerClient.request<{
      registry: {
        labelConnection: {
          totalCount: number
          pageInfo: { hasNextPage: boolean; endCursor: string | null }
          edges: { node: RegistryLabelRow }[]
        }
      } | null
    }>(
      gql`
        query getRegistryLabels($address: String!, $first: Int!, $after: String) {
          registry(address: $address) {
            labelConnection(
              first: $first
              after: $after
              orderBy: name
              orderDirection: asc
            ) {
              totalCount
              pageInfo {
                hasNextPage
                endCursor
              }
              edges {
                node {
                  name
                  labelName
                  labelhash
                  expiryDate
                  roleHoldersCount: roleHolderCount
                }
              }
            }
          }
        }
      `,
      {
        address: address.toLowerCase(),
        first: REGISTRY_LABELS_PAGE_SIZE,
        after,
      },
    ),
    (e) => new GetRegistryLabelsError({ cause: e as GraphqlRequestError }),
  )

  const connection = registry?.labelConnection

  return ok({
    labels: connection?.edges.map(({ node }) => node) ?? [],
    totalCount: connection?.totalCount ?? 0,
    endCursor: connection?.pageInfo.endCursor ?? null,
    hasNextPage: connection?.pageInfo.hasNextPage ?? false,
  } satisfies RegistryLabelsPage)
})

const getRegistryLabelsQueryKey = createQueryKey<
  'get-registry-labels',
  GetRegistryLabelsParameters
>('get-registry-labels')

export const getRegistryLabelsQueryOptions = (
  params: GetRegistryLabelsParameters,
) =>
  resultInfiniteQueryOptions({
    queryKey: getRegistryLabelsQueryKey(params),
    queryFn: ({ pageParam }) =>
      getRegistryLabelsPage({ ...params, after: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: RegistryLabelsPage) =>
      last.hasNextPage ? (last.endCursor ?? undefined) : undefined,
  })
