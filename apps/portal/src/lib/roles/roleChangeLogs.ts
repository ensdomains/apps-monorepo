import { logger } from '@ens-apps/utils/logger'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { eacRolesChangedEventSnippet } from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import { gql } from '@urql/core'
import { fromPromise, ok } from 'neverthrow'
import { type Address, getAddress, type Hex, isAddressEqual, isHex } from 'viem'
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

/** Page size for the indexed read. */
export const INDEXED_ROLE_EVENTS_PAGE_SIZE = 1000

/** Pages the indexed read walks before handing over to the node. */
export const INDEXED_ROLE_EVENTS_MAX_PAGES = 10

/**
 * How long the indexed read may take, across every page, before the node
 * answers instead. A stalled connection that never rejects would otherwise
 * leave the roles page loading with a working fallback sitting idle.
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
      id
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

class IndexedRoleChangeLogsError extends TaggedError(
  'IndexedRoleChangeLogsError',
)<{
  /** Why the node has to answer instead. */
  reason: 'failed' | 'timeout' | 'truncated'
  cause: unknown
}> {}

// Rows are JSON from the indexer and are not trusted as typed. Each field is
// checked and converted here, so a block number or timestamp never exists as a
// `number` past this point, and a malformed row fails the read rather than
// folding garbage into the role state.
const asRecord = (value: unknown, name: string): Record<string, unknown> => {
  if (value !== null && typeof value === 'object') {
    return value as Record<string, unknown>
  }
  throw new Error(`Indexed role event: ${name} is not an object`)
}

const asHex = (value: unknown, name: string): Hex => {
  if (typeof value === 'string' && isHex(value)) return value
  throw new Error(`Indexed role event: ${name} is not hex`)
}

const asBigInt = (value: unknown, name: string): bigint => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return BigInt(value)
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value)
  throw new Error(`Indexed role event: ${name} is not an integer`)
}

const toRoleChangeLog = (
  row: Record<string, unknown>,
): RoleChangeLog | undefined => {
  if (row.asEACRolesChanged == null) return undefined
  const change = asRecord(row.asEACRolesChanged, 'asEACRolesChanged')

  return {
    blockNumber: asBigInt(row.blockNumber, 'blockNumber'),
    transactionHash: asHex(row.transactionHash, 'transactionHash'),
    timestamp: asBigInt(row.timestamp, 'timestamp'),
    args: {
      resource: BigInt(asHex(change.resource, 'resource')),
      // Checksummed like a node log, so Map keys and zero-address checks match.
      account: getAddress(asHex(change.account, 'account')),
      oldRoleBitmap: BigInt(asHex(change.oldRoleBitmap, 'oldRoleBitmap')),
      newRoleBitmap: BigInt(asHex(change.newRoleBitmap, 'newRoleBitmap')),
    },
  }
}

type IndexedRow = {
  readonly id: string
  readonly blockNumber: bigint
  readonly logIndex: bigint
  readonly log: RoleChangeLog | undefined
}

/** Row ids are `<transactionHash>-<logIndex>`. */
const toIndexedRow = (raw: unknown): IndexedRow => {
  const row = asRecord(raw, 'row')
  const id = typeof row.id === 'string' ? row.id : ''
  const logIndex = /^0x[0-9a-fA-F]{64}-(\d+)$/.exec(id)?.[1]
  if (logIndex === undefined) {
    throw new Error('Indexed role event: id has no log index')
  }

  return {
    id,
    blockNumber: asBigInt(row.blockNumber, 'blockNumber'),
    logIndex: BigInt(logIndex),
    log: toRoleChangeLog(row),
  }
}

const byChainOrder = (a: IndexedRow, b: IndexedRow) =>
  a.blockNumber === b.blockNumber
    ? Number(a.logIndex - b.logIndex)
    : Number(a.blockNumber - b.blockNumber)

type IndexedRoleChangeLogs = {
  readonly logs: readonly RoleChangeLog[]
  readonly complete: boolean
}

/**
 * Pages by block rather than offset, since the indexer orders only by block:
 * each page restarts at the last block seen and drops rows already read, so
 * ties straddling a page boundary are neither lost nor repeated.
 */
const fetchIndexedRoleChangeLogs = async ({
  variables,
  signal,
}: {
  readonly variables: {
    readonly contractAddress: string
    readonly resource: string
    readonly fromBlock: number
  }
  readonly signal: AbortSignal
}): Promise<IndexedRoleChangeLogs> => {
  const seen = new Set<string>()
  let rows: readonly IndexedRow[] = []
  let cursor = variables.fromBlock

  const result = (complete: boolean): IndexedRoleChangeLogs => ({
    logs: rows.toSorted(byChainOrder).flatMap(({ log }) => (log ? [log] : [])),
    complete,
  })

  for (let page = 0; page < INDEXED_ROLE_EVENTS_MAX_PAGES; page += 1) {
    if (signal.aborted) return result(false)

    const { eacRolesChangeds } = await graphqlIndexerClient.request<{
      eacRolesChangeds: readonly unknown[]
    }>(ROLE_CHANGE_EVENTS_QUERY, {
      ...variables,
      fromBlock: cursor,
      first: INDEXED_ROLE_EVENTS_PAGE_SIZE,
    })
    const pageRows = eacRolesChangeds.map(toIndexedRow)

    rows = rows.concat(pageRows.filter(({ id }) => !seen.has(id)))
    for (const { id } of pageRows) seen.add(id)

    if (pageRows.length < INDEXED_ROLE_EVENTS_PAGE_SIZE) return result(true)

    const last = Number(pageRows[pageRows.length - 1].blockNumber)
    // One block fills the page, so the cursor cannot move past it.
    if (last === cursor) return result(false)
    cursor = last
  }

  return result(false)
}

/**
 * The indexed history for one resource. Errs, with the reason, when the node
 * has to answer instead: the indexer failed or stalled, a row would not map,
 * or the history ran past the page budget and may hide older changes.
 *
 * The indexer has no filter on the changed account (`involved` is a different
 * field), so `account` narrows the rows here. Rows come oldest-first, matching
 * the node, since callers fold `newRoleBitmap` in that order.
 */
export const getIndexedRoleChangeLogs = ResultFn(async function* ({
  registryAddress,
  resource,
  account,
  fromBlock = ROLES_FROM_BLOCK,
}: GetRoleChangeLogsParameters) {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort()
      resolve(null)
    }, INDEXED_ROLE_EVENTS_TIMEOUT_MS)
  })
  const request = fetchIndexedRoleChangeLogs({
    variables: {
      contractAddress: registryAddress.toLowerCase(),
      resource: toResourceHex(resource),
      // Same lower bound the node read applies, so both sources answer the
      // same question for a caller that narrows the range.
      fromBlock: Number(fromBlock),
    },
    signal: controller.signal,
  })

  const fetched = yield* fromPromise(
    Promise.race([request, timeout]).finally(() => clearTimeout(timer)),
    (cause) => new IndexedRoleChangeLogsError({ reason: 'failed', cause }),
  )
  if (fetched === null) {
    return yield* new IndexedRoleChangeLogsError({
      reason: 'timeout',
      cause: undefined,
    }).toErr()
  }
  if (!fetched.complete) {
    return yield* new IndexedRoleChangeLogsError({
      reason: 'truncated',
      cause: undefined,
    }).toErr()
  }

  return ok(
    fetched.logs.filter(
      (log) => !account || isAddressEqual(log.args.account, account),
    ),
  )
})

/**
 * `EACRolesChanged` logs for one resource read straight from the node,
 * complete or failed.
 *
 * Filtered on the single event rather than ensjs's `eacRolesEvents` array:
 * with several events viem cannot apply the indexed `args` per event, so the
 * filter widens to every role event on the registry and the RPC rejects it
 * outright ("query returns too many logs, narrow your filter").
 */
export const getNodeRoleChangeLogs = ResultFn(async function* ({
  registryAddress,
  resource,
  account,
  fromBlock = ROLES_FROM_BLOCK,
  toBlock,
}: GetRoleChangeLogsParameters & { readonly toBlock?: bigint }) {
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
      toBlock,
      strict: true,
    }),
    (e) => new GetRoleChangeLogsError({ cause: e as GetLogsErrorType }),
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
 * or a resource with more history than the page budget holds; each fallback
 * is logged with its reason so a failing indexer does not go unnoticed.
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

  const logs = yield* getNodeRoleChangeLogs({
    registryAddress,
    resource,
    account,
    fromBlock,
  })

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
