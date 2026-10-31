import type { Role } from '@ensdomains/ensjs/utils/v2'
import { useQuery } from '@tanstack/react-query'
import { match, P } from 'ts-pattern'
import { type Address, zeroAddress } from 'viem'
import { getIsRegistryPendingUpgradeQueryOptions } from '@/features/registry/queries/getIsRegistryPendingUpgrade'
import { getRegistryRootRoleCountsQueryOptions } from '@/features/registry/queries/getRegistryRootRoleCounts'
import {
  isRestrictedGrantBlocked,
  isUpgradeRevokeBlocked,
} from '@/features/registry/utils/registryRoleAccess'
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
    enabled: isPendingUpgrade === true,
  })
  const { data: accountRootRoles } = useQuery({
    ...getNameRolesForAccountQueryOptions({
      registryAddress,
      resource: ROOT_RESOURCE_ID,
      account: account ?? zeroAddress,
    }),
    enabled: account !== null && isPendingUpgrade === true,
    // Read as fresh as the counts it is subtracted from.
    staleTime: 0,
  })
  const isBlocked = (toGrant: readonly Role[], toRevoke: readonly Role[]) =>
    isUpgradeRevokeBlocked({
      isPendingUpgrade,
      rootRoleCounts,
      accountRoles: accountRootRoles?.decoded,
      toGrant,
      toRevoke,
    })
  const isGrantBlocked = isRestrictedGrantBlocked({
    isPendingUpgrade,
    toGrant: saveGrants,
  })
  const isUpgradeBlocked = isBlocked(saveGrants, saveRevokes)
  const isRemoveBlocked = isBlocked([], removeRevokes)
  return {
    isSaveBlocked: isGrantBlocked || isUpgradeBlocked,
    isRemoveBlocked,
    notice: getUpgradeGuardNotice({
      isPendingUpgrade,
      isGrantBlocked,
      isUpgradeBlocked: isUpgradeBlocked || isRemoveBlocked,
    }),
  }
}

export type UpgradeGuardNotice = 'grant' | 'upgrade' | null

// Unknown still blocks, but only a confirmed registry gets an explanation.
const getUpgradeGuardNotice = (state: {
  readonly isPendingUpgrade: boolean | undefined
  readonly isGrantBlocked: boolean
  readonly isUpgradeBlocked: boolean
}): UpgradeGuardNotice =>
  match(state)
    .with({ isPendingUpgrade: P.not(true) }, () => null)
    .with({ isGrantBlocked: true }, () => 'grant' as const)
    .with({ isUpgradeBlocked: true }, () => 'upgrade' as const)
    .otherwise(() => null)
