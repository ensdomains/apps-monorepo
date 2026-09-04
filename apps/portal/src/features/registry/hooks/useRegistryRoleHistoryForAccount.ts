/**
 * Role-change history for a single account at the **registry root** resource.
 *
 * Both topics are pinned, so this is one account's complete root-role history
 * on this registry. Block times are backfilled because logs carry none; a
 * single account's root history is a handful of entries and the lookup dedupes
 * blocks, so that is one or two extra reads.
 */

import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { ok } from 'neverthrow'
import type { Address, Hex } from 'viem'
import { getBlockTimestamps } from '@/features/profile/hooks/useBlockTimestamps'
import { decodeRoleBitmap } from '@/lib/roles/decodeRoleBitmap'
import { getRoleChangeLogs } from '@/lib/roles/roleChangeLogs'
import type { RoleHistoryEntry } from '@/lib/roles/roleHistoryEntry'
import { ROOT_RESOURCE } from '@/lib/roles/rootResource'
import { toResourceHex } from '@/lib/roles/toResourceHex'

export type GetRegistryRoleHistoryParameters = {
  readonly registryAddress: Address
  readonly account: Address
  /** Earliest block to scan. See `ROLES_FROM_BLOCK`. */
  readonly fromBlock: bigint
}

const ROOT_RESOURCE_HEX = toResourceHex(ROOT_RESOURCE)

export const getRegistryRoleHistoryForAccount = ResultFn(async function* ({
  registryAddress,
  account,
  fromBlock,
}: GetRegistryRoleHistoryParameters) {
  const logs = yield* getRoleChangeLogs({
    registryAddress,
    fromBlock,
    resource: ROOT_RESOURCE,
    account,
  })

  const timestamps = yield* getBlockTimestamps({
    blocks: logs.map((log) => log.blockNumber),
  })

  const entries: RoleHistoryEntry[] = logs
    .map((log) => ({
      account,
      resource: ROOT_RESOURCE_HEX,
      oldRoles: decodeRoleBitmap(log.args.oldRoleBitmap ?? 0n),
      newRoles: decodeRoleBitmap(log.args.newRoleBitmap ?? 0n),
      transactionHash: log.transactionHash as Hex,
      timestamp: timestamps.get(log.blockNumber) ?? 0n,
      blockNumber: log.blockNumber,
    }))
    .toSorted((a, b) => Number(b.blockNumber - a.blockNumber))

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
