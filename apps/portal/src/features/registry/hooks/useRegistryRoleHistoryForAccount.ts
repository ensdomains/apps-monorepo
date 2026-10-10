import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { Address } from 'viem'
import { getBignameRootRoleChanges } from '@/lib/roles/rootRoleReads'

export type GetRegistryRoleHistoryParameters = {
  readonly registryAddress: Address
  readonly account: Address
}

/** One account's indexed root-role history, newest first. */
export const getRegistryRoleHistoryForAccount = getBignameRootRoleChanges

export const getRegistryRoleHistoryForAccountQueryKey = createQueryKey<
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
