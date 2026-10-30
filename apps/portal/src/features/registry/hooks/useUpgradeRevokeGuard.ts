import type { Role } from '@ensdomains/ensjs/utils/v2'
import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { getIsRegistryPendingUpgradeQueryOptions } from '@/features/registry/queries/getIsRegistryPendingUpgrade'
import { isUpgradeRevokeBlocked } from '@/features/registry/utils/registryRoleAccess'
import type { RootRoleHolder } from '@/features/roles/hooks/useRegistryRootRoleHolders'

/** Which of the sheet's revokes would leave a UserRegistry pending an upgrade un-upgradeable. */
export const useUpgradeRevokeGuard = ({
  registryAddress,
  account,
  rows,
  saveRevokes,
  removeRevokes,
}: {
  readonly registryAddress: Address
  readonly account: Address | null
  readonly rows: readonly RootRoleHolder[] | undefined
  readonly saveRevokes: readonly Role[]
  readonly removeRevokes: readonly Role[]
}) => {
  const { data: isPendingUpgrade } = useQuery(
    getIsRegistryPendingUpgradeQueryOptions({ registryAddress }),
  )
  const isBlocked = (toRevoke: readonly Role[]) =>
    isUpgradeRevokeBlocked({ isPendingUpgrade, rows, account, toRevoke })
  const isSaveBlocked = isBlocked(saveRevokes)
  const isRemoveBlocked = isBlocked(removeRevokes)
  return {
    isSaveBlocked,
    isRemoveBlocked,
    isAnyBlocked: isSaveBlocked || isRemoveBlocked,
  }
}
