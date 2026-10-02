import type { Role } from '@ensdomains/ensjs/utils/v2'
import { useQuery } from '@tanstack/react-query'
import { zeroAddress } from 'viem'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { GetEnsOwnerReturnType } from '@/features/profile/hooks/useEnsOwner'
import { RoleNames } from '@/features/roles/components/PrivilegeWarningBadge'
import { getNameRolesAccountsQueryOptions } from '@/features/roles/hooks/useNameRoleAccounts'
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
 * neither subregistry role, nobody can ever configure one, so the configure
 * form gives way to a notice saying so.
 */
export const UnconfiguredRegistry = ({
  name,
  ownerData,
}: {
  readonly name: string
  readonly ownerData: NonNullable<GetEnsOwnerReturnType>
}) => {
  const { data: warning, isLoading } = useQuery({
    ...getNameRolesAccountsQueryOptions({
      name,
      registryAddress: ownerData.registryAddress,
    }),
    select: (holders) =>
      getSubregistryWarning({
        owner: ownerData.owner,
        holders,
        subregistry: zeroAddress,
        wrapperRegistry: null,
      }),
  })

  if (isLoading) return <LoadingSpinner title="Checking permissions..." />

  // A failed read falls through to the form, which checks the connected
  // wallet's own role before offering anything.
  if (warning?.kind === 'locked')
    return <LockedRegistryNotice missing={warning.missing} />

  return <ConfigureRegistryForm name={name} />
}
