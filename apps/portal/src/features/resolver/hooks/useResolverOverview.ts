import type { GraphqlRequestError } from '@ens-apps/indexer/urql'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { gql } from '@urql/core'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { graphqlIndexerClient } from '@/lib/indexer'

/**
 * A name that shares its record with at least one other name on this resolver.
 *
 * Records are internal inodes: a setter creates one and links the name to it,
 * and `linkToNode` points a second name at the same `recordId`. So a link is
 * not a stored `from -> to` pair, it is two names resolving to one record.
 *
 * The indexer's legacy `aliases { fromName toName }` field is never populated
 * for a V2 resolver; the live mapping is `Resolver.linkedNames`.
 */
export type ResolverLink = {
  readonly name: string
  readonly namehash: string
  readonly recordId: string
  /** The other names on the same record. */
  readonly sharedWith: readonly string[]
}

/** A resource preimage revealed by `ResourceArgument`, for labelling scopes. */
export type ResolverNamedResource = {
  readonly resource: string
  readonly recordKind: string | null
  readonly recordKey: string | null
  readonly coinType: string | null
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
  readonly namedResources: readonly ResolverNamedResource[]
  readonly roles: readonly ResolverRole[]
  readonly events: readonly ResolverEvent[]
}

class GetResolverOverviewError extends TaggedError('GetResolverOverviewError')<{
  cause: GraphqlRequestError
}> {}

type GetResolverOverviewParameters = {
  address: Address
}

export type IndexerLinkedName = {
  readonly name: string
  readonly namehash: string
  readonly recordId: string
}

type IndexerResponse = {
  readonly resolver:
    | (Omit<ResolverOverview, 'links' | 'linkCount'> & {
        readonly namedResources: readonly ResolverNamedResource[] | null
      })
    | null
  readonly resolvers:
    | readonly { readonly linkedNames: readonly IndexerLinkedName[] | null }[]
    | null
}

/** Names sharing a `recordId` are linked; a record with one name is not. */
export const toLinks = (
  entries: IndexerResponse['resolvers'],
): readonly ResolverLink[] => {
  const byRecord = new Map<string, IndexerLinkedName[]>()
  for (const entry of entries ?? []) {
    for (const linked of entry.linkedNames ?? []) {
      const existing = byRecord.get(linked.recordId)
      if (existing) existing.push(linked)
      else byRecord.set(linked.recordId, [linked])
    }
  }

  const links: ResolverLink[] = []
  for (const group of byRecord.values()) {
    if (group.length < 2) continue
    for (const linked of group) {
      links.push({
        name: linked.name,
        namehash: linked.namehash,
        recordId: linked.recordId,
        sharedWith: group
          .filter((other) => other.name !== linked.name)
          .map((other) => other.name),
      })
    }
  }
  return links
}

/**
 * The links remaining after `sourceName` is unlinked. A link is a view over a
 * shared-record group, so the unlinked name leaves every group it appeared in,
 * and any row left sharing with nobody is no longer a link at all.
 */
export const pruneLinksAfterUnlink = (
  links: readonly ResolverLink[],
  sourceName: string,
): ResolverLink[] =>
  links
    .filter((link) => link.name !== sourceName)
    .map((link) => ({
      ...link,
      sharedWith: link.sharedWith.filter((other) => other !== sourceName),
    }))
    .filter((link) => link.sharedWith.length > 0)

const getResolverOverview = ResultFn(async function* ({
  address,
}: GetResolverOverviewParameters) {
  const { resolver, resolvers } = yield* fromPromise(
    graphqlIndexerClient.request<IndexerResponse>(
      gql`
        query getResolverOverview($id: String!) {
          resolver(id: $id) {
            id
            address
            nodeCount
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
            namedResources {
              resource
              recordKind
              recordKey
              coinType
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
          resolvers(first: 1000, where: { address: $id }) {
            linkedNames {
              name
              namehash
              recordId
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

  const links = toLinks(resolvers)
  return ok({
    ...resolver,
    namedResources: resolver.namedResources ?? [],
    links,
    linkCount: links.length,
  })
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
