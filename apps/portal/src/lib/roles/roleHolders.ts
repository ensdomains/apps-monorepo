import { logger } from '@ens-apps/utils/logger'
import { fromSync, ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { gql } from '@urql/core'
import { fromPromise, ok } from 'neverthrow'
import { type Address, getAddress, isHex } from 'viem'
import { graphqlIndexerClient } from '@/lib/indexer'
import {
  getNodeRoleChangeLogs,
  INDEXED_ROLE_EVENTS_TIMEOUT_MS,
} from '@/lib/roles/roleChangeLogs'
import { toResourceHex } from '@/lib/roles/toResourceHex'

type GetRoleHoldersParameters = {
  readonly registryAddress: Address
  readonly resource: bigint
}

/** An account and the role bitmap it currently holds on one resource. */
export type RoleHolder = {
  readonly account: Address
  readonly roleBitmap: bigint
}

class IndexedRoleHoldersError extends TaggedError('IndexedRoleHoldersError')<{
  reason: 'failed' | 'timeout' | 'truncated'
  cause: unknown
}> {}

const ROLE_HOLDERS_PAGE_SIZE = 1000

/** Past this many pages the node answers instead of the indexer. */
const ROLE_HOLDERS_MAX_PAGES = 20

const ROLE_HOLDERS_QUERY = gql`
  query RoleHolders(
    $contract: String!
    $resource: String!
    $first: Int!
    $after: String
  ) {
    roleConnection(
      contract: $contract
      resource: $resource
      first: $first
      after: $after
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          account
          roleBitmap
          blockNumber
        }
      }
    }
  }
`

type IndexedRoleHoldersPage = {
  readonly roleConnection?: {
    readonly pageInfo: {
      readonly hasNextPage: boolean
      readonly endCursor: string | null
    }
    readonly edges: readonly { readonly node: unknown }[]
  }
}

type IndexedRoleHoldersRequest = {
  readonly contract: string
  readonly resource: string
}

type IndexedRoleHolder = RoleHolder & { readonly blockNumber: number }

/** Throws on a malformed row, so the node answers instead. */
const toIndexedRoleHolder = (raw: unknown): IndexedRoleHolder => {
  if (raw === null || typeof raw !== 'object')
    throw new Error('Indexed role holder: row is not an object')
  const { account, roleBitmap, blockNumber } = raw as Record<string, unknown>
  if (typeof account !== 'string' || !isHex(account))
    throw new Error('Indexed role holder: account is not hex')
  if (typeof roleBitmap !== 'string' || !isHex(roleBitmap))
    throw new Error('Indexed role holder: roleBitmap is not hex')
  if (typeof blockNumber !== 'number' || !Number.isSafeInteger(blockNumber))
    throw new Error('Indexed role holder: blockNumber is not an integer')
  return {
    account: getAddress(account),
    roleBitmap: BigInt(roleBitmap),
    blockNumber,
  }
}

const getIndexedRoleHoldersPage = ResultFn(async function* (
  variables: IndexedRoleHoldersRequest & { readonly after: string | undefined },
) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), INDEXED_ROLE_EVENTS_TIMEOUT_MS)
  })
  const request = graphqlIndexerClient.request<IndexedRoleHoldersPage>(
    ROLE_HOLDERS_QUERY,
    { ...variables, first: ROLE_HOLDERS_PAGE_SIZE },
  )

  const page = yield* fromPromise(
    Promise.race([request, timeout]).finally(() => clearTimeout(timer)),
    (cause) => new IndexedRoleHoldersError({ reason: 'failed', cause }),
  )
  if (page === null) {
    return yield* new IndexedRoleHoldersError({
      reason: 'timeout',
      cause: undefined,
    }).toErr()
  }
  if (!page.roleConnection) {
    return yield* new IndexedRoleHoldersError({
      reason: 'failed',
      cause: page,
    }).toErr()
  }

  return ok(page.roleConnection)
})

/** The accounts the indexer lists as holding roles on a resource. */
const getIndexedRoleHolders = ResultFn(async function* (
  request: IndexedRoleHoldersRequest,
) {
  const rows: unknown[] = []
  let after: string | undefined

  for (let page = 0; page < ROLE_HOLDERS_MAX_PAGES; page++) {
    const { edges, pageInfo } = yield* getIndexedRoleHoldersPage({
      ...request,
      after,
    })
    rows.push(...edges.map(({ node }) => node))
    if (!pageInfo.hasNextPage) {
      // The indexer returns assignments in no stated order; oldest first
      // matches the order the node replay produces.
      const holders = yield* fromSync(
        () =>
          rows
            .map(toIndexedRoleHolder)
            .toSorted((a, b) => a.blockNumber - b.blockNumber)
            .map(
              ({ account, roleBitmap }): RoleHolder => ({
                account,
                roleBitmap,
              }),
            ),
        (cause) => new IndexedRoleHoldersError({ reason: 'failed', cause }),
      )
      return ok<readonly RoleHolder[]>(holders)
    }
    if (!pageInfo.endCursor) {
      return yield* new IndexedRoleHoldersError({
        reason: 'failed',
        cause: pageInfo,
      }).toErr()
    }
    after = pageInfo.endCursor
  }

  return yield* new IndexedRoleHoldersError({
    reason: 'truncated',
    cause: undefined,
  }).toErr()
})

/**
 * Each account's current role bitmap on one resource of one registry. The node
 * cannot list holders, so its fallback replays the role logs oldest-first.
 */
export const getRoleHolders = ResultFn(async function* ({
  registryAddress,
  resource,
}: GetRoleHoldersParameters) {
  const indexed = await getIndexedRoleHolders({
    contract: registryAddress.toLowerCase(),
    resource: toResourceHex(resource),
  })
  if (indexed.isOk()) return ok(indexed.value)

  logger.warn('Role holders read fell back to the node', {
    registryAddress,
    resource: toResourceHex(resource),
    reason: indexed.error.reason,
    cause: indexed.error.cause,
  })

  const logs = yield* getNodeRoleChangeLogs({ registryAddress, resource })
  const latest = new Map<Address, bigint>()
  for (const log of logs) latest.set(log.args.account, log.args.newRoleBitmap)

  return ok<readonly RoleHolder[]>(
    [...latest].map(([account, roleBitmap]) => ({ account, roleBitmap })),
  )
})
