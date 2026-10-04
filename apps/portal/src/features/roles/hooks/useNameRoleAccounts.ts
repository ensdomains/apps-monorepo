import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { GetNameRolesAccountsReturnType } from '@ensdomains/ensjs/public/v2'
import type { Role } from '@ensdomains/ensjs/utils/v2'
import { type Address, zeroAddress } from 'viem'
import { getNameRoleChanges } from '@/lib/roles/nameRoleChanges'
import { normalizeOrLower } from '@/utils/ens/normalizeOrLower'

type NameRolesAccountsParameters = {
  /** The full name. */
  readonly name: string
  readonly registryAddress: Address
}

/**
 * Current `account -> roles[]` state for a name's token, folded from bigname's
 * role-change history for the current registration (`getNameRoleChanges`).
 * Each change carries the account's whole set after it, and changes arrive
 * oldest-first, so writing each account as it is seen leaves its latest set;
 * an account left with nothing has been revoked and is dropped.
 *
 * Folded from history rather than read from `/v1/permissions` on purpose:
 * history's sets are the registry's stored roles, before the read-time masks
 * (locked roles, grace) current permission rows apply, and the grant and
 * revoke flows that use this edit the stored roles.
 */
export const getNameRolesAccounts = (params: NameRolesAccountsParameters) =>
  getNameRoleChanges(params).map((changes): GetNameRolesAccountsReturnType => {
    const latest = new Map<Address, Role[]>()
    for (const change of changes) {
      if (change.account === zeroAddress) continue
      latest.set(change.account, [...change.newRoles])
    }
    return new Map([...latest].filter(([, roles]) => roles.length > 0))
  })

const getNameRolesAccountsQueryKey = createQueryKey<
  'get-name-roles-accounts',
  NameRolesAccountsParameters
>('get-name-roles-accounts')

export const getNameRolesAccountsQueryOptions = ({
  name,
  ...params
}: NameRolesAccountsParameters) =>
  resultQueryOptions({
    queryKey: getNameRolesAccountsQueryKey({
      // Normalized so two spellings of one name share a cache entry.
      name: normalizeOrLower(name),
      ...params,
    }),
    queryFn: ({ queryKey: [, params] }) => getNameRolesAccounts(params),
  })
