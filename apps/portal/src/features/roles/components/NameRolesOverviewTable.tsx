import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Fragment, useState } from 'react'
import { type Address, zeroAddress } from 'viem'
import { useConnection } from 'wagmi'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { Button } from '@/components/ui/button'
import { getNameLabels } from '@/features/registry/utils/nameUtils'
import { RolesAddUserSheet } from '@/features/roles/components/RolesAddUserSheet'
import { RolesTable } from '@/features/roles/components/RolesTable'
import { getNameRolesAccountsQueryOptions } from '@/features/roles/hooks/useNameRoleAccounts'
import { getNameRolesForAccountQueryOptions } from '@/features/roles/hooks/useNameRolesForAccount'
import { getRegistryRootRoleCountsQueryOptions } from '@/features/roles/hooks/useRegistryRootRoleCounts'
import { rootNameAuthority } from '@/features/roles/utils/rootNameAuthority'
import { formatRoleLabel } from '@/lib/roles/formatRoleLabel'
import { isAdminRole } from '@/lib/roles/permissions'

const ROLES_FROM_BLOCK = 9783977n

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

  const nameRolesQuery = useQuery({
    ...getNameRolesAccountsQueryOptions({
      name,
      registryAddress,
      fromBlock: ROLES_FROM_BLOCK,
    }),
    enabled: labels.length >= 2,
  })

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
 * including this one, and they never appear in the table above: the table
 * replays per-name grants, and a root grant is not one.
 *
 * Counts rather than addresses, because the registry tracks how many accounts
 * hold each root role but not which. Read-only for the same reason, and because
 * the manage flows write per-name grants, so a revoke aimed at a root holder
 * would silently do nothing.
 */
const RegistryRootAuthority = ({
  registryAddress,
}: {
  registryAddress: Address
}) => {
  const { data, isError } = useQuery(
    getRegistryRootRoleCountsQueryOptions({ registryAddress }),
  )

  const authority = rootNameAuthority(data)

  // A failed read is unknown, not none. Staying silent here would reproduce the
  // absence this section exists to correct.
  if (isError)
    return (
      <div className="flex flex-col gap-2">
        <h3 className="text-caps leading-none">registry-wide roles</h3>
        <ErrorMessage
          compact
          description="Couldn't check whether anyone holds roles on the registry itself. If they do, they can act on this name and won't be listed above."
        />
      </div>
    )

  // Silent when nothing is held, the common case: no `.eth` root holder can act
  // on a 2LD. Silent while loading too, rather than appearing and rewriting.
  if (authority.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-caps leading-none">registry-wide roles</h3>
      <p className="text-muted-foreground text-sm">
        These are held on the registry itself, so they apply to every name in it
        rather than being granted on this one. They are not listed above and
        can't be changed from this page.
      </p>
      <ul className="flex flex-col gap-1">
        {authority.map(({ role, holders }) => (
          <li key={role} className="text-sm">
            <span className="text-foreground font-medium">
              {formatRoleLabel(role)}
            </span>
            <span className="text-muted-foreground">
              {' '}
              held by {holders} {holders === 1 ? 'account' : 'accounts'}
            </span>
          </li>
        ))}
      </ul>
    </div>
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
  const label = name.split('.')[0]

  const { data: currentAccountRoles } = useQuery({
    ...getNameRolesForAccountQueryOptions({
      registryAddress,
      label,
      account: address ?? zeroAddress,
    }),
    enabled: Boolean(address),
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
