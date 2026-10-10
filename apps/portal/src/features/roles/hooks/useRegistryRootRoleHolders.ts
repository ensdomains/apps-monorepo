import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { Address } from 'viem'
import {
  getBignameRootRoleHolders,
  type RegistryRootRoles,
} from '@/lib/roles/rootRoleReads'

export type {
  RegistryRootRoles,
  RootRoleHolder,
} from '@/lib/roles/rootRoleReads'

type GetRegistryRootRoleHoldersParameters = {
  readonly registryAddress: Address
}

/** Current registry root roles from BigName. */
export const getRegistryRootRoles = getBignameRootRoleHolders

export const getRegistryRootRoleHoldersQueryKey = createQueryKey<
  'get-registry-root-role-holders',
  GetRegistryRootRoleHoldersParameters
>('get-registry-root-role-holders')

/** The holders, and whether the list leaves operator-held roles out. */
export const getRegistryRootRolesQueryOptions = (
  params: GetRegistryRootRoleHoldersParameters,
) =>
  resultQueryOptions({
    queryKey: getRegistryRootRoleHoldersQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getRegistryRootRoles(params),
  })

const selectHolders = ({ holders }: RegistryRootRoles) => holders

/** The holders alone, from the same cache entry. */
export const getRegistryRootRoleHoldersQueryOptions = (
  params: GetRegistryRootRoleHoldersParameters,
) =>
  resultQueryOptions({
    queryKey: getRegistryRootRoleHoldersQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getRegistryRootRoles(params),
    select: selectHolders,
  })
