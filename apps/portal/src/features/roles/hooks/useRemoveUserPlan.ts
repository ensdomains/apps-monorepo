import type { GetNameRolesAccountsReturnType } from '@ensdomains/ensjs/public/v2'
import type { Role } from '@ensdomains/ensjs/utils/v2'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { type Address, zeroAddress } from 'viem'
import { getAccountAdminRoles } from '@/features/registry/utils/registryRoleAccess'
import { getNameRolesForAccountQueryOptions } from '@/features/roles/hooks/useNameRolesForAccount'
import { getRegistryRootRoleHoldersQueryOptions } from '@/features/roles/hooks/useRegistryRootRoleHolders'
import {
  buildRemoveUserPlan,
  type RemoveUserPlan,
} from '@/features/roles/utils/removeUserPlan'
import { isAdminRole } from '@/lib/roles/permissions'
import { getLabel } from '@/utils/token/getLabel'

type UseRemoveUserPlanParameters = {
  readonly name: string
  readonly registryAddress: Address
  /** The account whose row is being removed. */
  readonly account: Address | undefined
  /** That account's current roles on the name. */
  readonly currentRoles: readonly Role[]
  /** Every account holding roles on the name. */
  readonly roleHolders: GetNameRolesAccountsReturnType
  /** The name's token owner, once known. */
  readonly ownerAddress: Address | undefined
  /** The connected wallet, whose `_ADMIN` roles decide what may be revoked. */
  readonly callerAddress: Address | undefined
}

/**
 * Reads what {@link buildRemoveUserPlan} needs to know about the caller and the
 * registry root, then builds the plan for `account`'s row.
 */
export const useRemoveUserPlan = ({
  name,
  registryAddress,
  account,
  currentRoles,
  roleHolders,
  ownerAddress,
  callerAddress,
}: UseRemoveUserPlanParameters): RemoveUserPlan => {
  // A raw route parameter would address a resource the registry never wrote to,
  // so the label is normalised first. `getLabel` throws on a name it can't
  // normalise; that leaves the query disabled, which reads as no admin roles and
  // so disables Remove user rather than under-reporting what it would revoke.
  const label = useMemo(() => {
    try {
      return getLabel(name)
    } catch {
      return null
    }
  }, [name])

  const { data: callerRolesData } = useQuery({
    ...getNameRolesForAccountQueryOptions({
      registryAddress,
      label: label ?? '',
      account: callerAddress ?? zeroAddress,
    }),
    enabled: Boolean(callerAddress) && Boolean(label),
  })

  // Already fetched by the page's registry-wide roles section, so this is a cache
  // read in practice. Until it succeeds root authority is unknown, which is not
  // the same as root holding nothing.
  const { data: rootHolders, isSuccess: hasRootHolders } = useQuery(
    getRegistryRootRoleHoldersQueryOptions({ registryAddress }),
  )

  // Only `_ADMIN` roles authorise a revoke, so they alone decide what Remove user
  // may encode. `_getRevokableRoles` runs on `_effectiveRoles`, which ORs the
  // caller's root roles over its per-name ones, so root authority counts too.
  const callerAdminRoles = useMemo(
    () =>
      new Set<Role>([
        ...(callerRolesData?.decoded ?? []).filter(isAdminRole),
        ...getAccountAdminRoles(rootHolders, callerAddress),
      ]),
    [callerRolesData, rootHolders, callerAddress],
  )

  /** Root holders can grant on any resource, so these roles survive a revoke. */
  const rootAdminRoles = useMemo(
    () =>
      hasRootHolders
        ? new Set<Role>(
            rootHolders.flatMap((holder) => holder.roles.filter(isAdminRole)),
          )
        : undefined,
    [hasRootHolders, rootHolders],
  )

  const holders = useMemo(
    () =>
      [...roleHolders].map(([holder, roles]) => ({ account: holder, roles })),
    [roleHolders],
  )

  return buildRemoveUserPlan({
    account,
    currentRoles,
    callerAdminRoles,
    holders,
    ownerAddress,
    rootAdminRoles,
  })
}
