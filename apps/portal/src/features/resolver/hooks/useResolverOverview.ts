import type { GraphqlRequestError } from '@ens-apps/indexer/urql'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { gql } from '@urql/core'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { graphqlIndexerClient } from '@/lib/indexer'

/**
 * A name serving another name's record (post-audit-2 `linkToNode`). The indexer
 * still exposes these under the pre-refactor `aliases { fromName toName }`
 * shape; they are mapped to `links` here so the UI has one vocabulary.
 */
export type ResolverLink = {
  readonly fromName: string
  readonly toName: string
}

export type ResolverRole = {
  readonly account: string
  readonly resource: string
  readonly roleBitmap: string
  readonly blockNumber: number
  readonly transactionHash: string | null
  readonly timestamp: number | null
  readonly name: string | null
}

export type ResolverEvent = {
  readonly id: string
  readonly type: string
  readonly blockNumber: number
  readonly timestamp: number | null
  readonly transactionHash: string | null
  readonly data: string
}

export type ResolverNode = {
  readonly id: string
  readonly name: string
  readonly owner: { readonly id: string } | null
  readonly resolver: { readonly id: string; readonly address: string } | null
}

export type ResolverOverview = {
  readonly id: string
  readonly address: string
  readonly nodeCount: number
  readonly linkCount: number
  readonly roleHolderCount: number
  readonly nodes: readonly ResolverNode[]
  readonly links: readonly ResolverLink[]
  readonly roles: readonly ResolverRole[]
  readonly events: readonly ResolverEvent[]
}

class GetResolverOverviewError extends TaggedError('GetResolverOverviewError')<{
  cause: GraphqlRequestError
}> {}

type GetResolverOverviewParameters = {
  address: Address
}

const getResolverOverview = ResultFn(async function* ({
  address,
}: GetResolverOverviewParameters) {
  type IndexerResolverOverview = Omit<
    ResolverOverview,
    'links' | 'linkCount'
  > & {
    readonly aliases: readonly ResolverLink[]
    readonly aliasCount: number
  }

  const { resolver } = yield* fromPromise(
    graphqlIndexerClient.request<{
      resolver: IndexerResolverOverview | null
    }>(
      gql`
        query getResolverOverview($id: String!) {
          resolver(id: $id) {
            id
            address
            nodeCount
            aliasCount
            roleHolderCount
            nodes {
              id
              name
              owner {
                id
              }
              resolver {
                id
                address
              }
            }
            aliases {
              fromName
              toName
            }
            roles {
              account
              resource
              roleBitmap
              blockNumber
              transactionHash
              timestamp
              name
            }
            events {
              id
              type
              blockNumber
              timestamp
              transactionHash
              data
            }
          }
        }
      `,
      { id: address.toLowerCase() },
    ),
    (e) =>
      new GetResolverOverviewError({
        cause: e as GraphqlRequestError,
      }),
  )

  if (!resolver) return ok(null)

  const { aliases, aliasCount, ...rest } = resolver
  return ok({ ...rest, links: aliases, linkCount: aliasCount })
})

const resolverOverviewQueryKey = createQueryKey<
  'resolver-overview',
  GetResolverOverviewParameters
>('resolver-overview')

export const getResolverOverviewQueryOptions = (
  params: GetResolverOverviewParameters,
) =>
  resultQueryOptions({
    queryKey: resolverOverviewQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getResolverOverview(params),
  })
