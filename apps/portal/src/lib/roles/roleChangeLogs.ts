import { logger } from '@ens-apps/utils/logger'
import { fromSync, ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { eacRolesChangedEventSnippet } from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import { gql } from '@urql/core'
import { fromPromise, ok } from 'neverthrow'
import { type Address, getAddress, type Hex, isAddressEqual } from 'viem'
import { type GetLogsErrorType, getLogs } from 'viem/actions'
import { getAction } from 'viem/utils'
import { getBlockTimestamps } from '@/features/profile/hooks/useBlockTimestamps'
import { graphqlIndexerClient } from '@/lib/indexer'
import { decodeRoleBitmap } from '@/lib/roles/decodeRoleBitmap'
import { ROLES_FROM_BLOCK } from '@/lib/roles/rolesFromBlock'
import { toResourceHex } from '@/lib/roles/toResourceHex'
import { safeGetClient } from '@/lib/wagmi/helpers'

/** Roles held here apply to every name in the registry rather than to one. */
export const ROOT_RESOURCE = 0n

class GetRoleChangeLogsError extends TaggedError('GetRoleChangeLogsError')<{
  cause: GetLogsErrorType
}> {}

export type GetRoleChangeLogsParameters = {
  readonly registryAddress: Address
  readonly resource: bigint
  /** Narrows to one account's changes via the second indexed topic. */
  readonly account?: Address
  readonly fromBlock?: bigint
}

/** One `EACRolesChanged`, in the shape both sources are folded to. */
type RoleChangeLog = {
  readonly blockNumber: bigint
  readonly transactionHash: Hex
  /** Set when the indexer supplied the row; a node log carries no time. */
  readonly timestamp?: bigint
  readonly args: {
    readonly resource: bigint
    readonly account: Address
    readonly oldRoleBitmap: bigint
    readonly newRoleBitmap: bigint
  }
}

/**
 * Page size for the indexed read. A page this full may have been cut, so the
 * caller falls back to the node rather than fold an incomplete history.
 */
const INDEXED_ROLE_EVENTS_LIMIT = 1000

/**
 * How long the indexed read may take before the node answers instead. A stalled
 * connection that never rejects would otherwise leave the roles page loading
 * with a working fallback sitting idle.
 */
export const INDEXED_ROLE_EVENTS_TIMEOUT_MS = 8_000

const ROLE_CHANGE_EVENTS_QUERY = gql`
  query RoleChangeEvents(
    $contractAddress: String!
    $resource: String!
    $fromBlock: Int!
    $first: Int!
  ) {
    eacRolesChangeds(
      where: {
        contractAddress: $contractAddress
        resource: $resource
        blockNumber_gte: $fromBlock
      }
      first: $first
      orderBy: blockNumber
      orderDirection: asc
    ) {
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
`

type RoleChangeEventRow = {
  readonly blockNumber: number
  readonly timestamp: number
  readonly transactionHash: Hex
  readonly asEACRolesChanged: {
    readonly resource: Hex
    readonly account: Address
    readonly oldRoleBitmap: Hex
    readonly newRoleBitmap: Hex
  } | null
}

class IndexedRoleChangeLogsError extends TaggedError(
  'IndexedRoleChangeLogsError',
)<{
  /** Why the node has to answer instead. */
  reason: 'failed' | 'timeout' | 'truncated'
  cause?: unknown
}> {}

const toRoleChangeLog = (
  row: RoleChangeEventRow,
): RoleChangeLog | undefined => {
  const change = row.asEACRolesChanged
  if (!change) return undefined

  return {
    blockNumber: BigInt(row.blockNumber),
    transactionHash: row.transactionHash,
    timestamp: BigInt(row.timestamp),
    args: {
      resource: BigInt(change.resource),
      // Checksummed like a node log, so Map keys and zero-address checks match.
      account: getAddress(change.account),
      oldRoleBitmap: BigInt(change.oldRoleBitmap),
      newRoleBitmap: BigInt(change.newRoleBitmap),
    },
  }
}

/**
 * The indexed history for one resource. Errs, with the reason, when the node
 * has to answer instead: the indexer failed or stalled, a row would not map,
 * or the page came back full and may hide older changes.
 *
 * The indexer has no filter on the changed account (`involved` is a different
 * field), so `account` narrows the rows here. Rows come oldest-first, matching
 * the node, since callers fold `newRoleBitmap` in that order.
 */
const getIndexedRoleChangeLogs = ResultFn(async function* ({
  registryAddress,
  resource,
  account,
  fromBlock,
}: Required<Pick<GetRoleChangeLogsParameters, 'fromBlock'>> &
  Omit<GetRoleChangeLogsParameters, 'fromBlock'>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), INDEXED_ROLE_EVENTS_TIMEOUT_MS)
  })
  const request = graphqlIndexerClient.request<{
    eacRolesChangeds: readonly RoleChangeEventRow[]
  }>(ROLE_CHANGE_EVENTS_QUERY, {
    contractAddress: registryAddress.toLowerCase(),
    resource: toResourceHex(resource),
    // Same lower bound the node read applies, so both sources answer the
    // same question for a caller that narrows the range.
    fromBlock: Number(fromBlock),
    first: INDEXED_ROLE_EVENTS_LIMIT,
  })

  const page = yield* fromPromise(
    Promise.race([request, timeout]).finally(() => clearTimeout(timer)),
    (cause) => new IndexedRoleChangeLogsError({ reason: 'failed', cause }),
  )
  if (page === null) {
    return yield* new IndexedRoleChangeLogsError({ reason: 'timeout' }).toErr()
  }
  if (page.eacRolesChangeds.length >= INDEXED_ROLE_EVENTS_LIMIT) {
    return yield* new IndexedRoleChangeLogsError({
      reason: 'truncated',
    }).toErr()
  }

  const logs = yield* fromSync(
    () =>
      page.eacRolesChangeds
        .map(toRoleChangeLog)
        .filter((log): log is RoleChangeLog => log !== undefined)
        .filter((log) => !account || isAddressEqual(log.args.account, account)),
    (cause) => new IndexedRoleChangeLogsError({ reason: 'failed', cause }),
  )

  return ok(logs)
})

/**
 * `EACRolesChanged` logs for one resource on one registry.
 *
 * Read from the indexer first: the node path is a single `getLogs` over every
 * block since `ROLES_FROM_BLOCK`, which drpc answers in 7 to 20 seconds, and
 * because the transport batches JSON-RPC, every other read in the same batch
 * waits on it (WEB-1540). The node remains the fallback for an indexer outage
 * or a resource with more history than one page holds; each fallback is
 * logged with its reason so a failing indexer does not go unnoticed.
 *
 * The node read is filtered on the single event rather than ensjs's
 * `eacRolesEvents` array: with several events viem cannot apply the indexed
 * `args` per event, so the filter widens to every role event on the registry
 * and the RPC rejects it outright ("query returns too many logs, narrow your
 * filter").
 */
export const getRoleChangeLogs = ResultFn(async function* ({
  registryAddress,
  resource,
  account,
  fromBlock = ROLES_FROM_BLOCK,
}: GetRoleChangeLogsParameters) {
  const indexed = await getIndexedRoleChangeLogs({
    registryAddress,
    resource,
    account,
    fromBlock,
  })
  if (indexed.isOk()) return ok(indexed.value)

  logger.warn('Role change read fell back to the node', {
    registryAddress,
    resource: toResourceHex(resource),
    reason: indexed.error.reason,
    cause: indexed.error.cause,
  })

  const client = yield* safeGetClient()

  const logs = yield* fromPromise(
    getAction(
      client,
      getLogs,
      'getLogs',
    )({
      address: registryAddress,
      event: eacRolesChangedEventSnippet[0],
      args: { resource, account },
      fromBlock,
      strict: true,
    }),
    (e) => new GetRoleChangeLogsError({ cause: e as GetLogsErrorType }),
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

class MissingBlockTimestampError extends TaggedError(
  'MissingBlockTimestampError',
)<{
  blockNumber: bigint
}> {}

/**
 * Decode role logs into display entries, newest first.
 *
 * Node logs carry no timestamp, so their block times are fetched in a second
 * step. That lookup answers for every block it is given or fails as a whole,
 * so a missing timestamp is a broken invariant rather than a date to guess at.
 */
export const toRoleHistoryEntries = ResultFn(async function* ({
  logs,
  resource,
}: {
  readonly logs: readonly RoleChangeLog[]
  readonly resource: bigint
}) {
  // Indexed rows already carry their time; only node logs need the lookup.
  const undated = logs.filter((log) => log.timestamp === undefined)
  const timestamps =
    undated.length > 0
      ? yield* getBlockTimestamps({
          blocks: undated.map((log) => log.blockNumber),
        })
      : new Map<bigint, bigint>()

  const resourceHex = toResourceHex(resource)
  const entries: RoleHistoryEntry[] = []

  for (const log of logs) {
    const timestamp = log.timestamp ?? timestamps.get(log.blockNumber)
    if (timestamp === undefined) {
      return yield* new MissingBlockTimestampError({
        blockNumber: log.blockNumber,
      }).toErr()
    }

    entries.push({
      account: log.args.account,
      resource: resourceHex,
      oldRoles: decodeRoleBitmap(log.args.oldRoleBitmap),
      newRoles: decodeRoleBitmap(log.args.newRoleBitmap),
      transactionHash: log.transactionHash,
      timestamp,
      blockNumber: log.blockNumber,
    })
  }

  return ok(entries.toSorted((a, b) => Number(b.blockNumber - a.blockNumber)))
})
