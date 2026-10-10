import {
  type BignameError,
  type EventRow,
  MAX_PAGE_SIZE,
  type Power,
  readAllCollectionPages,
  toExactSeconds,
} from '@ens-apps/indexer/bigname'
import { logger } from '@ens-apps/utils/logger'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { encodeRoleBitmap } from '@ensdomains/ensjs/utils/v2'
import { eacRolesChangedEventSnippet } from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import { err, errAsync, fromPromise, ok, okAsync } from 'neverthrow'
import { type Address, getAddress, type Hex, isAddressEqual } from 'viem'
import { type GetLogsErrorType, getLogs } from 'viem/actions'
import { getAction } from 'viem/utils'
import { getBlockTimestamps } from '@/features/profile/hooks/useBlockTimestamps'
import { bigname } from '@/lib/bigname'
import { decodeRoleBitmap } from '@/lib/roles/decodeRoleBitmap'
import { previousPowers } from '@/lib/roles/permissionPowers'
import { registryPowersToRoles } from '@/lib/roles/registryPowerRoles'
import { ROLES_FROM_BLOCK } from '@/lib/roles/rolesFromBlock'
import { toResourceHex } from '@/lib/roles/toResourceHex'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { normalizeOrLower } from '@/utils/ens/normalizeOrLower'

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

/** Rows the indexed read takes before handing over to the node. */
export const INDEXED_ROLE_EVENTS_MAX_ROWS = 2000

/**
 * How long the indexed read may take, across every page, before the node
 * answers instead. A stalled connection that never rejects would otherwise
 * leave the roles page loading with a working fallback sitting idle.
 */
export const INDEXED_ROLE_EVENTS_TIMEOUT_MS = 8_000

class IndexedRoleChangeLogsError extends TaggedError(
  'IndexedRoleChangeLogsError',
)<{
  /** Why the node has to answer instead. */
  reason: 'failed' | 'timeout' | 'truncated' | 'unindexed'
  /** The read's error, or the name bigname has not indexed. */
  cause: BignameError | Error | string | undefined
}> {}

type PermissionRow = Extract<EventRow, { type: 'permission' }>

const isRegistryRoleChange =
  (registryAddress: Address) =>
  (row: EventRow): row is PermissionRow =>
    row.type === 'permission' &&
    !!row.data?.address &&
    row.data.grant_scope?.kind === 'registry' &&
    !!row.contract_address &&
    isAddressEqual(row.contract_address, registryAddress)

/**
 * The rows as `EACRolesChanged` logs, oldest first. bigname states each
 * change as named powers; they are encoded back into role bitmaps, and the
 * set before a change is its stated diff, or else the account's previous row.
 */
const toRoleChangeLogs = (
  rows: readonly EventRow[],
  registryAddress: Address,
  resource: bigint,
): RoleChangeLog[] => {
  const lastSeen = new Map<Address, readonly Power[]>()
  return rows.filter(isRegistryRoleChange(registryAddress)).flatMap((row) => {
    const data = row.data ?? {}
    const account = getAddress(data.address ?? '')
    const powers = data.powers ?? []
    const before = previousPowers(data, lastSeen.get(account))
    lastSeen.set(account, powers)
    const timestamp = toExactSeconds(row.timestamp)
    if (!row.transaction_hash || row.block_number === null || !timestamp)
      return []
    return [
      {
        blockNumber: BigInt(row.block_number),
        transactionHash: row.transaction_hash,
        timestamp,
        args: {
          resource,
          account,
          oldRoleBitmap: encodeRoleBitmap(registryPowersToRoles(before)),
          newRoleBitmap: encodeRoleBitmap(registryPowersToRoles(powers)),
        },
      },
    ]
  })
}

const readRegistrationRoleRows = ResultFn(async function* (name: string) {
  const toError = (cause: BignameError) =>
    new IndexedRoleChangeLogsError({ reason: 'failed', cause })
  const registration = yield* bigname
    .name(normalizeOrLower(name))
    .map(({ data }) => data.registration_id)
    .orElse((error) =>
      error.code === 'not_found'
        ? okAsync(undefined)
        : errAsync(toError(error)),
    )
  if (!registration)
    return err(
      new IndexedRoleChangeLogsError({ reason: 'unindexed', cause: name }),
    )
  const rows = yield* readAllCollectionPages<EventRow>(
    (cursor) =>
      bigname.events({
        registration_id: registration,
        type: ['permission'],
        include: ['data', 'raw'],
        order: 'asc',
        page_size: MAX_PAGE_SIZE,
        ...(cursor && { cursor }),
      }),
    // Past the cap the node answers instead, so the walk stops there.
    { limit: INDEXED_ROLE_EVENTS_MAX_ROWS },
  ).mapErr(toError)
  if (rows.length > INDEXED_ROLE_EVENTS_MAX_ROWS)
    return err(
      new IndexedRoleChangeLogsError({ reason: 'truncated', cause: undefined }),
    )
  return ok(rows)
})

/**
 * The indexed history for one name's current registration, from bigname.
 * Anchored on the registration, as the node read is on the versioned
 * resource: a previous owner's grants belong to an earlier registration.
 * Errs, with the reason, when the node has to answer instead.
 */
export const getIndexedRoleChangeLogs = ResultFn(async function* ({
  name,
  registryAddress,
  resource,
  account,
}: GetRoleChangeLogsParameters & { readonly name: string }) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), INDEXED_ROLE_EVENTS_TIMEOUT_MS)
  })
  const fetched = yield* fromPromise(
    Promise.race([readRegistrationRoleRows(name), timeout]).finally(() =>
      clearTimeout(timer),
    ),
    (cause) =>
      new IndexedRoleChangeLogsError({
        reason: 'failed',
        cause: cause instanceof Error ? cause : new Error(String(cause)),
      }),
  )
  if (fetched === null) {
    return yield* new IndexedRoleChangeLogsError({
      reason: 'timeout',
      cause: undefined,
    }).toErr()
  }
  const rows = yield* fetched
  return ok(
    toRoleChangeLogs(rows, registryAddress, resource).filter(
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
 * Read from bigname first: the node path is a single `getLogs` over every
 * block since `ROLES_FROM_BLOCK`, which drpc answers in 7 to 20 seconds, and
 * because the transport batches JSON-RPC, every other read in the same batch
 * waits on it (WEB-1540). The node remains the fallback for an indexer outage
 * or a resource with more history than the page budget holds; each fallback
 * is logged with its reason so a failing indexer does not go unnoticed.
 */
export const getRoleChangeLogs = ResultFn(async function* ({
  name,
  registryAddress,
  resource,
  account,
  fromBlock = ROLES_FROM_BLOCK,
}: GetRoleChangeLogsParameters & { readonly name: string }) {
  const indexed = await getIndexedRoleChangeLogs({
    name,
    registryAddress,
    resource,
    account,
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
