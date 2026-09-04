/**
 * Role-change history for a single account at the **registry root** resource.
 *
 * `EACRolesChanged` declares `resource` and `account` as indexed topics, so one
 * `getLogs` returns exactly this account's root-role changes on this registry,
 * complete. No indexer paging, no window, nothing to report as truncated.
 * `getNameRoleAccounts` in ensjs reads the per-name equivalent the same way.
 *
 * Filtered on the single event rather than ensjs's `eacRolesEvents` array: with
 * several events viem cannot apply the indexed `args` per event, so the filter
 * widens to every role event on the registry and the RPC rejects it outright
 * ("query returns too many logs, narrow your filter").
 *
 * Logs carry no timestamp, so the block times are backfilled in a second step.
 * A single account's root history is a handful of entries, and the lookup
 * dedupes blocks, so that is one or two extra reads.
 */

import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { eacRolesChangedEventSnippet } from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import { fromPromise, ok } from 'neverthrow'
import type { Address, Hex } from 'viem'
import { type GetLogsErrorType, getLogs } from 'viem/actions'
import { getAction } from 'viem/utils'
import { getBlockTimestamps } from '@/features/profile/hooks/useBlockTimestamps'
import { decodeRoleBitmap } from '@/lib/roles/decodeRoleBitmap'
import type { RoleHistoryEntry } from '@/lib/roles/filterEventsByResource'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetRegistryRoleHistoryError extends TaggedError(
  'GetRegistryRoleHistoryError',
)<{
  cause: GetLogsErrorType
}> {}

export type GetRegistryRoleHistoryParameters = {
  readonly registryAddress: Address
  readonly account: Address
  /** Earliest block to scan. Defaults to the v2 registry deployment. */
  readonly fromBlock?: bigint
}

/** `ROOT_RESOURCE` — roles held here apply to every name in the registry. */
const ROOT_RESOURCE = 0n

/** First block holding v2 registry events (matches the roles table's scan). */
const DEFAULT_FROM_BLOCK = 9783977n

const getRegistryRoleHistoryForAccount = ResultFn(async function* ({
  registryAddress,
  account,
  fromBlock = DEFAULT_FROM_BLOCK,
}: GetRegistryRoleHistoryParameters) {
  const client = yield* safeGetClient()

  const logs = yield* fromPromise(
    getAction(
      client,
      getLogs,
      'getLogs',
    )({
      address: registryAddress,
      event: eacRolesChangedEventSnippet[0],
      args: { resource: ROOT_RESOURCE, account },
      fromBlock,
    }),
    (e) => new GetRegistryRoleHistoryError({ cause: e as GetLogsErrorType }),
  )

  const timestamps = yield* getBlockTimestamps({
    blocks: logs.map((log) => log.blockNumber),
  })

  const entries: RoleHistoryEntry[] = logs
    .map((log) => ({
      account,
      resource: ROOT_RESOURCE.toString(),
      oldRoles: decodeRoleBitmap(log.args.oldRoleBitmap ?? 0n),
      newRoles: decodeRoleBitmap(log.args.newRoleBitmap ?? 0n),
      transactionHash: log.transactionHash as Hex,
      timestamp: Number(timestamps.get(log.blockNumber) ?? 0n),
      blockNumber: Number(log.blockNumber),
    }))
    .toSorted((a, b) => b.blockNumber - a.blockNumber)

  return ok(entries)
})

const getRegistryRoleHistoryForAccountQueryKey = createQueryKey<
  'get-registry-role-history-for-account',
  GetRegistryRoleHistoryParameters
>('get-registry-role-history-for-account')

export const getRegistryRoleHistoryForAccountQueryOptions = (
  params: GetRegistryRoleHistoryParameters,
) =>
  resultQueryOptions({
    queryKey: getRegistryRoleHistoryForAccountQueryKey(params),
    queryFn: ({ queryKey: [, params] }) =>
      getRegistryRoleHistoryForAccount(params),
  })
