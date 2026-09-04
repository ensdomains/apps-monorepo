import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { eacRolesChangedEventSnippet } from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import { fromPromise, ok } from 'neverthrow'
import type { Address, Hex } from 'viem'
import {
  type GetLogsErrorType,
  type GetLogsReturnType,
  getLogs,
} from 'viem/actions'
import { getAction } from 'viem/utils'
import { getBlockTimestamps } from '@/features/profile/hooks/useBlockTimestamps'
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

/**
 * `EACRolesChanged` logs for one resource on one registry.
 *
 * Filtered on the single event rather than ensjs's `eacRolesEvents` array: with
 * several events viem cannot apply the indexed `args` per event, so the filter
 * widens to every role event on the registry and the RPC rejects it outright
 * ("query returns too many logs, narrow your filter").
 */
export const getRoleChangeLogs = ResultFn(async function* ({
  registryAddress,
  resource,
  account,
  fromBlock = ROLES_FROM_BLOCK,
}: GetRoleChangeLogsParameters) {
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

type RoleChangeEvent = (typeof eacRolesChangedEventSnippet)[0]

// `abiEvents` has to be the event array rather than `undefined`: its default is
// `[abiEvent]`, and overriding it with `undefined` drops `args` from the type.
type RoleChangeLog = GetLogsReturnType<
  RoleChangeEvent,
  [RoleChangeEvent],
  true
>[number]

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
 * Logs carry no timestamp, so block times are fetched in a second step. That
 * lookup answers for every block it is given or fails as a whole, so a missing
 * timestamp is a broken invariant rather than a date to guess at.
 */
export const toRoleHistoryEntries = ResultFn(async function* ({
  logs,
  resource,
}: {
  readonly logs: readonly RoleChangeLog[]
  readonly resource: bigint
}) {
  const timestamps = yield* getBlockTimestamps({
    blocks: logs.map((log) => log.blockNumber),
  })

  const resourceHex = toResourceHex(resource)
  const entries: RoleHistoryEntry[] = []

  for (const log of logs) {
    const timestamp = timestamps.get(log.blockNumber)
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
