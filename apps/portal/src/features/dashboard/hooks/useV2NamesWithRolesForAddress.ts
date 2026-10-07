import type { GraphqlRequestError } from '@ens-apps/indexer/urql'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import {
  resultInfiniteQueryOptions,
  resultQueryOptions,
} from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { gql } from '@urql/core'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { graphqlIndexerClient } from '@/lib/indexer'

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

const getV2NamesWithRolesForAddress = ResultFn(async function* ({
  address,
}: GetV2NamesWithRolesForAddressParameters) {
  const { roles, domains } = yield* fromPromise(
    graphqlIndexerClient.request<{
      roles: RoleAssignment[]
      domains: DomainData[]
    }>(
      gql`
        query getNamesWithRolesForAddress($account: String!) {
          roles(account: $account) {
            name
            roleBitmap
          }
          domains(where: { owner: $account }) {
            name
            expiryDate
            subdomainCount
          }
        }
      `,
      { account: address.toLowerCase() },
    ),
    (e) =>
      new GetV2NamesWithRolesForAddressError({
        cause: e as GetV2NamesWithRolesForAddressErrorType,
      }),
  )

  const rolesMap = toRoleBitmaps(roles)

  // Only include names the address owns, attaching role info where available
  const result: V2NameWithRoles[] = []
  for (const domain of domains) {
    result.push({
      name: domain.name,
      roleBitmap: rolesMap.get(domain.name) ?? '0',
      expiryDate: domain.expiryDate,
      subdomainCount: domain.subdomainCount,
    })
  }

  return ok(result)
})

const getV2NamesWithRolesForAddressQueryKey = createQueryKey<
  'get-v2-names-with-roles-for-address',
  GetV2NamesWithRolesForAddressParameters
>('get-v2-names-with-roles-for-address')

export const getV2NamesWithRolesForAddressQueryOptions = (
  params: GetV2NamesWithRolesForAddressParameters,
) =>
  resultQueryOptions({
    queryKey: getV2NamesWithRolesForAddressQueryKey(params),
    queryFn: ({ queryKey: [, params] }) =>
      getV2NamesWithRolesForAddress(params),
  })

const V2_NAMES_PAGE_SIZE = 100

type V2NamesPage = {
  readonly names: readonly V2NameWithRoles[]
  readonly totalCount: number
  readonly endCursor: string | null
  readonly hasNextPage: boolean
}

const getV2NamesPageForAddress = ResultFn(async function* ({
  address,
  after,
}: GetV2NamesWithRolesForAddressParameters & {
  readonly after: string | undefined
}) {
  const { roles, domainConnection } = yield* fromPromise(
    graphqlIndexerClient.request<{
      roles: RoleAssignment[]
      domainConnection: {
        totalCount: number
        pageInfo: { hasNextPage: boolean; endCursor: string | null }
        edges: { node: DomainData }[]
      }
    }>(
      gql`
        query getNamesPageForAddress(
          $account: String!
          $first: Int!
          $after: String
        ) {
          roles(account: $account) {
            name
            roleBitmap
          }
          domainConnection(
            first: $first
            after: $after
            where: { owner: $account }
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
        }
      `,
      {
        account: address.toLowerCase(),
        first: V2_NAMES_PAGE_SIZE,
        after,
      },
    ),
    (e) =>
      new GetV2NamesWithRolesForAddressError({
        cause: e as GetV2NamesWithRolesForAddressErrorType,
      }),
  )

  const roleBitmaps = toRoleBitmaps(roles)

  return ok({
    names: domainConnection.edges.map(({ node }) => ({
      ...node,
      roleBitmap: roleBitmaps.get(node.name) ?? '0',
    })),
    totalCount: domainConnection.totalCount,
    endCursor: domainConnection.pageInfo.endCursor,
    hasNextPage: domainConnection.pageInfo.hasNextPage,
  } satisfies V2NamesPage)
})

const getV2NamesPagesForAddressQueryKey = createQueryKey<
  'get-v2-names-with-roles-for-address',
  GetV2NamesWithRolesForAddressParameters & { readonly only: 'pages' }
>('get-v2-names-with-roles-for-address')

export const getV2NamesPagesForAddressQueryOptions = (
  params: GetV2NamesWithRolesForAddressParameters,
) =>
  resultInfiniteQueryOptions({
    queryKey: getV2NamesPagesForAddressQueryKey({ ...params, only: 'pages' }),
    queryFn: ({ pageParam }) =>
      getV2NamesPageForAddress({ ...params, after: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: V2NamesPage) =>
      last.hasNextPage ? (last.endCursor ?? undefined) : undefined,
  })
