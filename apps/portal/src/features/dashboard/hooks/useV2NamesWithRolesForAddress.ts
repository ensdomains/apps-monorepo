import type { GraphqlRequestError } from '@ens-apps/indexer/urql'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultInfiniteQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { gql } from '@urql/core'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { graphqlIndexerClient } from '@/lib/indexer'
import { escapeSearchWildcards } from '../utils/escapeSearchWildcards'
import { getOwnedNamesQueryKey } from './ownedNamesQueryKey'

type RoleAssignment = {
  name: string | null
  roleBitmap: string
}

type DomainData = {
  name: string
  expiryDate: number | null
  subdomainCount: number
}

export type V2NameWithRoles = {
  name: string
  expiryDate: number | null
  roleBitmap: string
  subdomainCount: number
}

class GetV2NamesWithRolesForAddressError extends TaggedError(
  'GetV2NamesWithRolesForAddressError',
)<{
  cause: GetV2NamesWithRolesForAddressErrorType
}> {}

type GetV2NamesWithRolesForAddressErrorType = GraphqlRequestError

type GetV2NamesWithRolesForAddressParameters = {
  address: Address
  readonly search?: string
}

/** Domain name -> role bitmap, keeping the highest when a name has several. */
const toRoleBitmaps = (roles: readonly RoleAssignment[]) => {
  const rolesMap = new Map<string, string>()
  for (const role of roles) {
    if (role.name) {
      const existing = rolesMap.get(role.name)
      if (!existing || BigInt(role.roleBitmap) > BigInt(existing)) {
        rolesMap.set(role.name, role.roleBitmap)
      }
    }
  }
  return rolesMap
}

const V2_NAMES_PAGE_SIZE = 100

/** The indexer sorts names without an expiry first, so they are read last, on their own. */
type V2NamesCursor = {
  readonly hasExpiry: boolean
  readonly after: string | undefined
}

type V2NamesPage = {
  readonly names: readonly V2NameWithRoles[]
  readonly totalCount: number
  readonly nextCursor: V2NamesCursor | undefined
}

const FIRST_V2_NAMES_CURSOR: V2NamesCursor = {
  hasExpiry: true,
  after: undefined,
}

const toDomainFilter = ({
  account,
  hasExpiry,
  search,
}: {
  readonly account: string
  readonly hasExpiry: boolean
  readonly search: string | undefined
}) => ({
  owner: account,
  ...(hasExpiry ? { expiry_gt: 0 } : { expiry_lte: 0 }),
  ...(search && { name_contains_nocase: escapeSearchWildcards(search) }),
})

const requestV2NamesPage = ResultFn(async function* ({
  address,
  search,
  hasExpiry,
  after,
}: GetV2NamesWithRolesForAddressParameters & V2NamesCursor) {
  const account = address.toLowerCase()

  const { roles, page, rest } = yield* fromPromise(
    graphqlIndexerClient.request<{
      roles: RoleAssignment[]
      page: {
        totalCount: number
        pageInfo: { hasNextPage: boolean; endCursor: string | null }
        edges: { node: DomainData }[]
      }
      rest: { totalCount: number }
    }>(
      gql`
        query getNamesPageForAddress(
          $account: String!
          $first: Int!
          $after: String
          $where: DomainFilter
          $rest: DomainFilter
        ) {
          roles(account: $account) {
            name
            roleBitmap
          }
          page: domainConnection(
            first: $first
            after: $after
            where: $where
            orderBy: expiryDate
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
                expiryDate
                subdomainCount
              }
            }
          }
          rest: domainConnection(first: 0, where: $rest) {
            totalCount
          }
        }
      `,
      {
        account,
        first: V2_NAMES_PAGE_SIZE,
        after,
        where: toDomainFilter({ account, hasExpiry, search }),
        rest: toDomainFilter({ account, hasExpiry: !hasExpiry, search }),
      },
    ),
    (e) =>
      new GetV2NamesWithRolesForAddressError({
        cause: e as GetV2NamesWithRolesForAddressErrorType,
      }),
  )

  const roleBitmaps = toRoleBitmaps(roles)

  return ok({
    names: page.edges.map(
      ({ node }): V2NameWithRoles => ({
        ...node,
        roleBitmap: roleBitmaps.get(node.name) ?? '0',
      }),
    ),
    restCount: rest.totalCount,
    totalCount: page.totalCount + rest.totalCount,
    nextCursor:
      page.pageInfo.hasNextPage && page.pageInfo.endCursor
        ? { hasExpiry, after: page.pageInfo.endCursor }
        : undefined,
  })
})

const getV2NamesPageForAddress = ResultFn(async function* ({
  address,
  search,
  cursor,
}: GetV2NamesWithRolesForAddressParameters & {
  readonly cursor: V2NamesCursor
}) {
  const page = yield* requestV2NamesPage({ address, search, ...cursor })
  const isLastWithExpiry = cursor.hasExpiry && !page.nextCursor
  if (!isLastWithExpiry || page.restCount === 0)
    return ok<V2NamesPage>({
      names: page.names,
      totalCount: page.totalCount,
      nextCursor: page.nextCursor,
    })

  const withoutExpiry = yield* requestV2NamesPage({
    address,
    search,
    hasExpiry: false,
    after: undefined,
  })

  return ok<V2NamesPage>({
    names: [...page.names, ...withoutExpiry.names],
    totalCount: withoutExpiry.totalCount,
    nextCursor: withoutExpiry.nextCursor,
  })
})

/** ENSv2 names of an address in pages, soonest expiry first, no expiry last. */
export const getV2NamesPagesForAddressQueryOptions = ({
  address,
  search,
}: GetV2NamesWithRolesForAddressParameters) =>
  resultInfiniteQueryOptions({
    queryKey: getOwnedNamesQueryKey({
      address,
      protocolVersion: 'ENSv2',
      search,
    }),
    queryFn: ({ pageParam }) =>
      getV2NamesPageForAddress({ address, search, cursor: pageParam }),
    initialPageParam: FIRST_V2_NAMES_CURSOR,
    getNextPageParam: (last: V2NamesPage) => last.nextCursor,
  })
