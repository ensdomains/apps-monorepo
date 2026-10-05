import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { ok } from 'neverthrow'
import type { Address } from 'viem'
import {
  getRoleChangeLogs,
  ROOT_RESOURCE,
  toRoleHistoryEntries,
} from '@/lib/roles/roleChangeLogs'
import {
  getBignameRootRoleChanges,
  getRootRoleReadsSupported,
} from '@/lib/roles/rootRoleReads'

export type GetRegistryRoleHistoryParameters = {
  readonly registryAddress: Address
  readonly account: Address
}

/**
 * One account's complete role-change history at a registry's root, newest
 * first: from bigname where the deployment serves `RootPermissionChanged`
 * rows, else from chain logs.
 *
 * v0.4.1 gives no error to detect here, so this follows the same capability
 * signal as the holders read; the two ship in one release. Remove the log
 * path once the release that accepts `GET /v1/permissions?registry=` is
 * deployed everywhere.
 */
export const getRegistryRoleHistoryForAccount = ResultFn(async function* ({
  registryAddress,
  account,
}: GetRegistryRoleHistoryParameters) {
  const isServedByBigname = yield* getRootRoleReadsSupported()
  if (isServedByBigname) {
    return ok(yield* getBignameRootRoleChanges({ registryAddress, account }))
  }

  const logs = yield* getRoleChangeLogs({
    registryAddress,
    resource: ROOT_RESOURCE,
    account,
  })

  const entries = yield* toRoleHistoryEntries({
    logs,
    resource: ROOT_RESOURCE,
  })

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
