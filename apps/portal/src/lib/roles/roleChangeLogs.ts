import { fromSync, ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { gql } from '@urql/core'
import { fromPromise, ok } from 'neverthrow'
import { type Address, getAddress, type Hex, isAddressEqual } from 'viem'
import { decodeRoleBitmap } from '@/lib/roles/decodeRoleBitmap'
import {
  asBigInt,
  asHex,
  asRecord,
  requestIndexedRoles,
} from '@/lib/roles/indexedRoles'
import { ROLES_FROM_BLOCK } from '@/lib/roles/rolesFromBlock'
import { toResourceHex } from '@/lib/roles/toResourceHex'

/** Roles held here apply to every name in the registry rather than to one. */
export const ROOT_RESOURCE = 0n

export type GetRoleChangeLogsParameters = {
  readonly registryAddress: Address
  readonly resource: bigint
  /** Narrows to one account's changes. */
  readonly account?: Address
  readonly fromBlock?: bigint
}

/** One `EACRolesChanged` as the indexer reports it. */
type RoleChangeLog = {
  readonly blockNumber: bigint
  readonly transactionHash: Hex
  readonly timestamp: bigint
  readonly args: {
    readonly resource: bigint
    readonly account: Address
    readonly oldRoleBitmap: bigint
    readonly newRoleBitmap: bigint
  }
}

const INDEXED_ROLE_EVENTS_PAGE_SIZE = 1000

/** Past this many pages the read fails rather than keep going. */
const INDEXED_ROLE_EVENTS_MAX_PAGES = 20

const ROLE_CHANGE_EVENTS_QUERY = gql`
  query RoleChangeEvents(
    $contractAddress: String!
    $resource: String!
    $fromBlock: Int!
    $first: Int!
    $after: String
  ) {
    eventConnection(
      where: {
        type: "EACRolesChanged"
        contractAddress: $contractAddress
        resource: $resource
        blockNumber_gte: $fromBlock
      }
      first: $first
      after: $after
      orderBy: blockNumber
      orderDirection: asc
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          blockNumber
          timestamp
          transactionHash
          asEACRolesChanged {
            resource
            account
            oldRoleBitmap
            newRoleBitmap
          }
        }
      }
    }
  }
`

type IndexedRoleEventsPage = {
  readonly eventConnection?: {
    readonly pageInfo: {
      readonly hasNextPage: boolean
      readonly endCursor: string | null
    }
    readonly edges: readonly { readonly node: unknown }[]
  }
}

class GetRoleChangeLogsError extends TaggedError('GetRoleChangeLogsError')<{
  reason: 'failed' | 'timeout' | 'truncated'
  cause: unknown
}> {}

const toRoleChangeLog = (raw: unknown): RoleChangeLog | undefined => {
  const row = asRecord(raw, 'row')
  if (row.asEACRolesChanged == null) return undefined
  const change = asRecord(row.asEACRolesChanged, 'asEACRolesChanged')

  return {
    blockNumber: asBigInt(row.blockNumber, 'blockNumber'),
    transactionHash: asHex(row.transactionHash, 'transactionHash'),
    timestamp: asBigInt(row.timestamp, 'timestamp'),
    args: {
      resource: BigInt(asHex(change.resource, 'resource')),
      // Checksummed, so Map keys and zero-address checks match.
      account: getAddress(asHex(change.account, 'account')),
      oldRoleBitmap: BigInt(asHex(change.oldRoleBitmap, 'oldRoleBitmap')),
      newRoleBitmap: BigInt(asHex(change.newRoleBitmap, 'newRoleBitmap')),
    },
  }
}

type IndexedRoleEventsRequest = {
  readonly contractAddress: string
  readonly resource: string
  readonly fromBlock: number
}

/** One page of the indexed history. */
const getIndexedRoleEventsPage = ResultFn(async function* (
  variables: IndexedRoleEventsRequest & { readonly after: string | undefined },
) {
  const page = yield* fromPromise(
    requestIndexedRoles<IndexedRoleEventsPage>(ROLE_CHANGE_EVENTS_QUERY, {
      ...variables,
      first: INDEXED_ROLE_EVENTS_PAGE_SIZE,
    }),
    (cause) => new GetRoleChangeLogsError({ reason: 'failed', cause }),
  )
  if (page === null) {
    return yield* new GetRoleChangeLogsError({
      reason: 'timeout',
      cause: undefined,
    }).toErr()
  }

  // Not trusted as typed: a response without the feed is a failed read.
  if (!page.eventConnection) {
    return yield* new GetRoleChangeLogsError({
      reason: 'failed',
      cause: page,
    }).toErr()
  }

  return ok(page.eventConnection)
})

/** Every page of the indexed history, oldest first. */
const getIndexedRoleEventRows = ResultFn(async function* (
  request: IndexedRoleEventsRequest,
) {
  const rows: unknown[] = []
  let after: string | undefined

  for (let page = 0; page < INDEXED_ROLE_EVENTS_MAX_PAGES; page++) {
    const { edges, pageInfo } = yield* getIndexedRoleEventsPage({
      ...request,
      after,
    })
    rows.push(...edges.map(({ node }) => node))
    if (!pageInfo.hasNextPage) return ok<readonly unknown[]>(rows)
    if (!pageInfo.endCursor) {
      return yield* new GetRoleChangeLogsError({
        reason: 'failed',
        cause: pageInfo,
      }).toErr()
    }
    after = pageInfo.endCursor
  }

  return yield* new GetRoleChangeLogsError({
    reason: 'truncated',
    cause: undefined,
  }).toErr()
})

/**
 * `EACRolesChanged` logs for one resource on one registry, oldest first, read
 * from the indexer. A failed, stalled, malformed or over-long read is an error.
 *
 * The indexer has no filter on the changed account (`involved` is a different
 * field), so `account` narrows the rows here.
 */
export const getRoleChangeLogs = ResultFn(async function* ({
  registryAddress,
  resource,
  account,
  fromBlock = ROLES_FROM_BLOCK,
}: GetRoleChangeLogsParameters) {
  const rows = yield* getIndexedRoleEventRows({
    contractAddress: registryAddress.toLowerCase(),
    resource: toResourceHex(resource),
    fromBlock: Number(fromBlock),
  })

  const logs = yield* fromSync(
    () =>
      rows
        .map(toRoleChangeLog)
        .filter((log): log is RoleChangeLog => log !== undefined)
        .filter((log) => !account || isAddressEqual(log.args.account, account)),
    (cause) => new GetRoleChangeLogsError({ reason: 'failed', cause }),
  )

  return ok(logs)
})

/** One `EACRolesChanged` log, decoded for display. */
export type RoleHistoryEntry = {
  readonly account: Address
  readonly resource: string
  readonly oldRoles: readonly string[]
  readonly newRoles: readonly string[]
  readonly transactionHash: Hex
  readonly timestamp: bigint
  readonly blockNumber: bigint
}

/** Decode role logs into display entries, newest first. */
export const toRoleHistoryEntries = ({
  logs,
  resource,
}: {
  readonly logs: readonly RoleChangeLog[]
  readonly resource: bigint
}): RoleHistoryEntry[] => {
  const resourceHex = toResourceHex(resource)

  return logs
    .map((log) => ({
      account: log.args.account,
      resource: resourceHex,
      oldRoles: decodeRoleBitmap(log.args.oldRoleBitmap),
      newRoles: decodeRoleBitmap(log.args.newRoleBitmap),
      transactionHash: log.transactionHash,
      timestamp: log.timestamp,
      blockNumber: log.blockNumber,
    }))
    .toSorted((a, b) => Number(b.blockNumber - a.blockNumber))
}
