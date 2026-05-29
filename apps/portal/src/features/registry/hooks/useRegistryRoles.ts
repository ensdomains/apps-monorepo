import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { Role } from '@ensdomains/ensjs/utils/v2'
import { type ClientError, gql } from 'graphql-request'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { graphqlIndexerClient } from '@/lib/indexer'
import { decodeRoleBitmap } from '@/lib/roles/decodeRoleBitmap'

class GetRegistryRolesError extends TaggedError('GetRegistryRolesError')<{
  cause: ClientError
}> {}

type GetRegistryRolesParameters = {
  address: Address
}

export type RegistryRoleRow = {
  /** Account holding registry-wide (root) roles. */
  account: Address
  /** Decoded role names held at the root resource (includes _ADMIN variants). */
  roles: Role[]
}

type IndexerRole = {
  account: string
  resource: string
  roleBitmap: string
}

type RolePage = {
  pageInfo: { hasNextPage: boolean; endCursor: string | null }
  edges: { node: IndexerRole }[]
}

const ROLES_PAGE_SIZE = 1000
// Safety bound so a misbehaving indexer can't loop forever (mirrors useRoleHistory).
const MAX_ROLE_PAGES = 50

// This indexer ignores GraphQL variables on connection args (roleConnection
// first/after) and only honors inline literals, so the cursor is inlined.
// Cursors are opaque base64 tokens; refuse anything else.
const isCursorToken = (value: string) => /^[A-Za-z0-9+/=]+$/.test(value)

// ROOT_RESOURCE (0x0) = registry-wide scope. A role here applies to the whole
// registry rather than a single name — i.e. the registry's admins/users.
const isRootResource = (resource: string) => BigInt(resource) === 0n

const buildRolesQuery = (afterCursor: string | null) => gql`
  query getRegistryRoles($address: String!) {
    registry(address: $address) {
      roleConnection(first: ${ROLES_PAGE_SIZE}${
        afterCursor ? `, after: "${afterCursor}"` : ''
      }) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            account
            resource
            roleBitmap
          }
        }
      }
    }
  }
`

const getRegistryRoles = ResultFn(async function* ({
  address,
}: GetRegistryRolesParameters) {
  const registryAddress = address.toLowerCase()

  // The role relation can't be filtered by resource server-side, so page through
  // every assignment (cursor inlined — variables are ignored) and keep only the
  // registry-wide root ones.
  const rootRoles: IndexerRole[] = []
  const collectRoots = (connection: RolePage) => {
    for (const { node } of connection.edges) {
      if (isRootResource(node.resource)) rootRoles.push(node)
    }
  }

  const { registry } = yield* fromPromise(
    graphqlIndexerClient.request<{
      registry: { roleConnection: RolePage } | null
    }>(buildRolesQuery(null), { address: registryAddress }),
    (e) => new GetRegistryRolesError({ cause: e as ClientError }),
  )

  // null = indexer has no record for this address (not a registry, or not yet
  // indexed). An empty list is the right shape here.
  if (!registry) return ok([])

  collectRoots(registry.roleConnection)
  let { hasNextPage, endCursor } = registry.roleConnection.pageInfo

  for (
    let page = 1;
    hasNextPage &&
    endCursor &&
    isCursorToken(endCursor) &&
    page < MAX_ROLE_PAGES;
    page++
  ) {
    const { registry: rolePage } = yield* fromPromise(
      graphqlIndexerClient.request<{
        registry: { roleConnection: RolePage } | null
      }>(buildRolesQuery(endCursor), { address: registryAddress }),
      (e) => new GetRegistryRolesError({ cause: e as ClientError }),
    )

    if (!rolePage) break
    collectRoots(rolePage.roleConnection)
    hasNextPage = rolePage.roleConnection.pageInfo.hasNextPage
    endCursor = rolePage.roleConnection.pageInfo.endCursor
  }

  // One bitmap per (resource, account); OR defensively against duplicates.
  const bitmapByAccount = new Map<string, bigint>()
  for (const role of rootRoles) {
    const key = role.account.toLowerCase()
    bitmapByAccount.set(
      key,
      (bitmapByAccount.get(key) ?? 0n) | BigInt(role.roleBitmap),
    )
  }

  const rows: RegistryRoleRow[] = Array.from(
    bitmapByAccount,
    ([account, bitmap]) => ({
      account: account as Address,
      roles: decodeRoleBitmap(bitmap),
    }),
  ).filter((row) => row.roles.length > 0)

  return ok(rows)
})

const getRegistryRolesQueryKey = createQueryKey<
  'get-registry-roles',
  GetRegistryRolesParameters
>('get-registry-roles')

export const getRegistryRolesQueryOptions = (
  params: GetRegistryRolesParameters,
) =>
  resultQueryOptions({
    queryKey: getRegistryRolesQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getRegistryRoles(params),
  })
