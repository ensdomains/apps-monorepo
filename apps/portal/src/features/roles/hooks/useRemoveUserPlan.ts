import type { GetNameRolesAccountsReturnType } from '@ensdomains/ensjs/public/v2'
import type { Role } from '@ensdomains/ensjs/utils/v2'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { Address } from 'viem'
import { getRegistryRootRoleHoldersQueryOptions } from '@/features/roles/hooks/useRegistryRootRoleHolders'
import {
  buildRemoveUserPlan,
  type RemoveUserPlan,
} from '@/features/roles/utils/removeUserPlan'
import { isAdminRole, isRegistryRole } from '@/lib/roles/permissions'

type UseRemoveUserPlanParameters = {
  readonly registryAddress: Address
  /** The account whose row is being removed. */
  readonly account: Address | undefined
  /** That account's current roles on the name. */
  readonly currentRoles: readonly Role[]
  /** Every account holding roles on the name. */
  readonly roleHolders: GetNameRolesAccountsReturnType
  /** The name's token owner, once known. */
  readonly ownerAddress: Address | undefined
  /** The connected wallet's `_ADMIN` roles on the name, root roles included. */
  readonly callerAdminRoles: ReadonlySet<Role>
}

/**
 * Reads what {@link buildRemoveUserPlan} needs to know about the registry root,
 * then builds the plan for `account`'s row.
 */
export const useRemoveUserPlan = ({
  registryAddress,
  account,
  currentRoles,
  roleHolders,
  ownerAddress,
  callerAdminRoles,
}: UseRemoveUserPlanParameters): RemoveUserPlan => {
  // Already fetched by the page's registry-wide roles section, so this is a cache
  // read in practice. Until it succeeds root authority is unknown, which is not
  // the same as root holding nothing.
  const { data: rootHolders, isSuccess: hasRootHolders } = useQuery(
    getRegistryRootRoleHoldersQueryOptions({ registryAddress }),
  )

  /** Root holders can grant on any resource, so these roles survive a revoke. */
  const rootAdminRoles = useMemo(
    () =>
      hasRootHolders
        ? new Set<Role>(
            rootHolders.flatMap((holder) =>
              holder.roles.filter(isRegistryRole).filter(isAdminRole),
            ),
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
