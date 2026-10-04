import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { type Address, isAddressEqual } from 'viem'
import { getNameRoleChanges } from '@/lib/roles/nameRoleChanges'
import type { RoleHistoryEntry } from '@/lib/roles/roleChangeLogs'

export type { RoleHistoryEntry } from '@/lib/roles/roleChangeLogs'

type GetRoleHistoryParameters = {
  readonly name: string
  readonly registryAddress: Address
  /** Narrows to one account's changes on this name. */
  readonly account?: Address
}

/**
 * Role-change history for one name's current registration, newest first, from
 * bigname's `permission` history (see `getNameRoleChanges`). A name's token
 * roles are all bigname serves; nothing here reads chain logs.
 */
export const getRoleHistory = ({
  name,
  registryAddress,
  account,
}: GetRoleHistoryParameters) =>
  getNameRoleChanges({ name, registryAddress }).map(
    (changes): RoleHistoryEntry[] =>
      changes
        .filter((change) => !account || isAddressEqual(change.account, account))
        .toReversed(),
  )

const getRoleHistoryQueryKey = createQueryKey<
  'get-role-history',
  GetRoleHistoryParameters
>('get-role-history')

export const getRoleHistoryQueryOptions = (params: GetRoleHistoryParameters) =>
  resultQueryOptions({
    queryKey: getRoleHistoryQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getRoleHistory(params),
  })
