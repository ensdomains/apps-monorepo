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

export type GetRegistryRoleHistoryParameters = {
  readonly registryAddress: Address
  readonly account: Address
}

/** One account's complete role-change history at a registry's root. */
export const getRegistryRoleHistoryForAccount = ResultFn(async function* ({
  registryAddress,
  account,
}: GetRegistryRoleHistoryParameters) {
  const logs = yield* getRoleChangeLogs({
    registryAddress,
    resource: ROOT_RESOURCE,
    account,
  })

  return ok(toRoleHistoryEntries({ logs, resource: ROOT_RESOURCE }))
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
