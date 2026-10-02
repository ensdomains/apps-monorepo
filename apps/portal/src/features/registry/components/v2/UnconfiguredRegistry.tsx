import type { Role } from '@ensdomains/ensjs/utils/v2'
import { zeroAddress } from 'viem'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { GetEnsOwnerReturnType } from '@/features/profile/hooks/useEnsOwner'
import { useHasSetSubregistryRole } from '@/features/registry/hooks/useHasSetSubregistryRole'
import { RoleNames } from '@/features/roles/components/PrivilegeWarningBadge'
import { useTokenRoleWarning } from '@/features/roles/hooks/useTokenRoleWarning'
import { getSubregistryWarning } from '@/features/roles/utils/missingPrivileges'
import { ConfigureRegistryForm } from './ConfigureRegistryForm'
import { RegistryPanel } from './RegistryPanel'

const LockedRegistryNotice = ({
  missing,
}: {
  readonly missing: readonly Role[]
}) => (
  <RegistryPanel>
    <Alert className="p-5 gap-2" variant="destructive">
      <AlertTitle>No registry configured</AlertTitle>
      <AlertDescription>
        <p>
          Subregistry is locked. Missing <RoleNames roles={missing} />
        </p>
      </AlertDescription>
    </Alert>
  </RegistryPanel>
)

/**
 * A v2 name whose subregistry slot has always been empty. If its owner holds
 * neither subregistry role, the configure form gives way to a notice saying the
 * slot is locked — unless the connected wallet can set it anyway (a delegate,
 * or a registry-root holder), in which case the form it can use stays.
 */
export const UnconfiguredRegistry = ({
  name,
  ownerData,
}: {
  readonly name: string
  readonly ownerData: NonNullable<GetEnsOwnerReturnType>
}) => {
  const { hasRole: canConfigure, isLoading: isRoleLoading } =
    useHasSetSubregistryRole(name)
  const { warning, isLoading } = useTokenRoleWarning(
    { name, ownerData },
    (holders) =>
      getSubregistryWarning({
        owner: ownerData.owner,
        holders,
        subregistry: zeroAddress,
        wrapperRegistry: null,
      }),
  )

  if (isLoading || isRoleLoading)
    return <LoadingSpinner title="Checking permissions..." />

  // A failed read falls through to the form, which checks the connected
  // wallet's own role before offering anything.
  if (warning?.kind === 'locked' && canConfigure !== true)
    return <LockedRegistryNotice missing={warning.missing} />

  return <ConfigureRegistryForm name={name} />
}
