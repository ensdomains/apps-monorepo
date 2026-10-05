import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Fragment, useState } from 'react'
import { match, P } from 'ts-pattern'
import { type Address, zeroAddress } from 'viem'
import { useConnection } from 'wagmi'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { AddressDisplay } from '@/components/table/EventsDataTable/AddressDisplay'
import { Button } from '@/components/ui/button'
import { getNameLabels } from '@/features/registry/utils/nameUtils'
import { RolesAddUserSheet } from '@/features/roles/components/RolesAddUserSheet'
import { RolesTable } from '@/features/roles/components/RolesTable'
import { getNameRolesAccountsQueryOptions } from '@/features/roles/hooks/useNameRoleAccounts'
import { getNameRolesForAccountQueryOptions } from '@/features/roles/hooks/useNameRolesForAccount'
import { getRegistryRootRoleHoldersQueryOptions } from '@/features/roles/hooks/useRegistryRootRoleHolders'
import { getVersionedResourceQueryOptions } from '@/features/roles/hooks/useVersionedResource'
import { rootNameAuthority } from '@/features/roles/utils/rootNameAuthority'
import { formatRoleLabel } from '@/lib/roles/formatRoleLabel'
import { isAdminRole } from '@/lib/roles/permissions'

const V2NameRoles = ({
  name,
  registryAddress,
  canManageRoles,
}: {
  name: string
  registryAddress: Address
  canManageRoles: boolean
}) => {
  const { labels } = getNameLabels(name)

  const {
    data: resourceId = null,
    isLoading: isReadingId,
    error: readIdError,
  } = useQuery(getVersionedResourceQueryOptions({ name, registryAddress }))

  const nameRolesQuery = useQuery({
    ...getNameRolesAccountsQueryOptions({
      resource: resourceId,
      registryAddress,
    }),
    enabled: labels.length >= 2 && Boolean(resourceId),
  })

  if (isReadingId) return <LoadingSpinner title="Identifying this name" />

  if (readIdError)
    return (
      <ErrorMessage
        compact
        description={`The registry could not be asked which name ${name} is, so its roles were not loaded.`}
      />
    )

  if (!resourceId)
    return (
      <NoResultsMessage
        title="This name has no on-chain identity to hold roles"
        className="mx-0"
      />
    )

  if (nameRolesQuery.isLoading)
    return <LoadingSpinner title="Loading role accounts" />

  if (nameRolesQuery.error)
    return (
      <ErrorMessage
        compact
        description="Error fetching role accounts. Please refresh the page."
      />
    )

  if (!nameRolesQuery.data)
    return <NoResultsMessage title="No role accounts" className="mx-0" />

  return (
    <RolesTable
      roles={nameRolesQuery.data}
      name={name}
      canManageRoles={canManageRoles}
      registryAddress={registryAddress}
    />
  )
}

/**
 * Accounts holding roles at the registry's root can act on every name it holds,
 * including this one, and they never appear in the table above: that table
 * replays per-name grants, and a root grant is not one.
 *
 * Read-only, because the manage flows write per-name grants, so a revoke aimed
 * at a root holder would silently do nothing.
 */
const RegistryRootAuthority = ({
  registryAddress,
}: {
  registryAddress: Address
}) => {
  const { data, isLoading, error } = useQuery(
    getRegistryRootRoleHoldersQueryOptions({ registryAddress }),
  )

  const holders = rootNameAuthority(data)

  return (
    match({ isLoading, error, data, count: holders.length })
      // Nothing is claimed until the read lands, and nothing is claimed when
      // nobody holds these powers, which is the case for a `.eth` 2LD.
      .with({ isLoading: true }, () => null)
      // A read that failed or never landed is unknown, not none. Staying silent
      // would reproduce the absence this section exists to correct.
      .with({ error: P.nonNullable }, { data: undefined }, () => (
        <div className="flex flex-col gap-2">
          <h3 className="text-caps leading-none">registry-wide roles</h3>
          <ErrorMessage
            compact
            description="Couldn't check whether anyone holds roles on the registry itself. If they do, they can act on this name and won't be listed above."
          />
        </div>
      ))
      .with({ count: 0 }, () => null)
      .otherwise(() => (
        <div className="flex flex-col gap-2">
          <h3 className="text-caps leading-none">registry-wide roles</h3>
          <p className="text-muted-foreground text-sm">
            These are held on the registry itself, so they apply to every name
            in it rather than being granted on this one. They are not listed
            above and can't be changed from this page.
          </p>
          <ul className="flex flex-col gap-2">
            {holders.map(({ account, powers }) => (
              <li key={account} className="flex flex-col gap-1 text-sm">
                <AddressDisplay address={account} />
                <span className="text-muted-foreground">
                  {powers.map(formatRoleLabel).join(', ')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))
  )
}

const AddUserButton = ({
  canManageRoles,
  onClick,
}: {
  canManageRoles: boolean
  onClick: () => void
}) => {
  if (!canManageRoles) return null

  return (
    <Button
      variant="default"
      className="flex items-center gap-2"
      onClick={onClick}
    >
      <Plus className="size-4" />
      Add user
    </Button>
  )
}

export const NameRolesOverviewTable = ({
  name,
  registryAddress,
}: {
  name: string
  registryAddress: Address
}) => {
  const [addUserOpen, setAddUserOpen] = useState(false)

  const { address } = useConnection()

  // Asked about the name's id, not the label: the two disagree for an encoded
  // (`[<64 hex>]`) label, which would either lock an admin out or show controls
  // for a transaction that reverts (WEB-1458).
  const { data: resourceId = null } = useQuery(
    getVersionedResourceQueryOptions({ name, registryAddress }),
  )

  const { data: currentAccountRoles } = useQuery({
    ...getNameRolesForAccountQueryOptions({
      registryAddress,
      resource: resourceId,
      account: address ?? zeroAddress,
    }),
    enabled: Boolean(address) && Boolean(resourceId),
  })

  const canManageRoles = Boolean(
    currentAccountRoles?.decoded?.find(isAdminRole),
  )

  return (
    <Fragment>
      <div className="flex items-center justify-between">
        <h3 className="text-caps leading-none">parent registry / roles</h3>
        {address && (
          <AddUserButton
            canManageRoles={canManageRoles}
            onClick={() => setAddUserOpen(true)}
          />
        )}
      </div>
      <V2NameRoles
        name={name}
        registryAddress={registryAddress}
        canManageRoles={canManageRoles}
      />
      <RegistryRootAuthority registryAddress={registryAddress} />
      <RolesAddUserSheet
        open={addUserOpen}
        onOpenChange={setAddUserOpen}
        name={name}
        registryAddress={registryAddress}
      />
    </Fragment>
  )
}
