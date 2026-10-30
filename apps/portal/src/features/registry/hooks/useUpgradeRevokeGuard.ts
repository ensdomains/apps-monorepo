import type { Role } from '@ensdomains/ensjs/utils/v2'
import { useQuery } from '@tanstack/react-query'
import { type Address, zeroAddress } from 'viem'
import { getIsRegistryPendingUpgradeQueryOptions } from '@/features/registry/queries/getIsRegistryPendingUpgrade'
import { getRegistryRootRoleCountsQueryOptions } from '@/features/registry/queries/getRegistryRootRoleCounts'
import { isUpgradeRevokeBlocked } from '@/features/registry/utils/registryRoleAccess'
import { getNameRolesForAccountQueryOptions } from '@/features/roles/hooks/useNameRolesForAccount'
import { ROOT_RESOURCE_ID } from '@/lib/resource/resourceId'

/** Which of the sheet's edits would leave a UserRegistry pending an upgrade with no one able to upgrade it. */
export const useUpgradeRevokeGuard = ({
  registryAddress,
  account,
  saveGrants,
  saveRevokes,
  removeRevokes,
}: {
  readonly registryAddress: Address
  readonly account: Address | null
  readonly saveGrants: readonly Role[]
  readonly saveRevokes: readonly Role[]
  readonly removeRevokes: readonly Role[]
}) => {
  const { data: isPendingUpgrade } = useQuery(
    getIsRegistryPendingUpgradeQueryOptions({ registryAddress }),
  )
  const { data: rootRoleCounts } = useQuery({
    ...getRegistryRootRoleCountsQueryOptions({ registryAddress }),
    enabled: isPendingUpgrade !== false,
  })
  const { data: accountRootRoles } = useQuery({
    ...getNameRolesForAccountQueryOptions({
      registryAddress,
      resource: ROOT_RESOURCE_ID,
      account: account ?? zeroAddress,
    }),
    enabled: account !== null && isPendingUpgrade !== false,
  })
  const isBlocked = (toGrant: readonly Role[], toRevoke: readonly Role[]) =>
    isUpgradeRevokeBlocked({
      isPendingUpgrade,
      rootRoleCounts,
      accountRoles: accountRootRoles?.decoded,
      toGrant,
      toRevoke,
    })
  const isSaveBlocked = isBlocked(saveGrants, saveRevokes)
  const isRemoveBlocked = isBlocked([], removeRevokes)
  return {
    isSaveBlocked,
    isRemoveBlocked,
    isAnyBlocked: isSaveBlocked || isRemoveBlocked,
  }
}
