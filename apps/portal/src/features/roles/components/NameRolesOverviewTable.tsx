import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Fragment, useState } from 'react'
import { type Address, zeroAddress } from 'viem'
import { useConnection } from 'wagmi'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { Button } from '@/components/ui/button'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getNameLabels } from '@/features/registry/utils/nameUtils'
import { RolesAddUserSheet } from '@/features/roles/components/RolesAddUserSheet'
import { RolesTable } from '@/features/roles/components/RolesTable'
import { getNameRolesAccountsQueryOptions } from '@/features/roles/hooks/useNameRoleAccounts'
import { getNameRolesForAccountQueryOptions } from '@/features/roles/hooks/useNameRolesForAccount'
import { isAdminRole } from '@/lib/roles/permissions'
import { sepoliaWithEns } from '@/lib/wagmi'

const ensRegistryAddress = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensRegistry',
})

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
  const { currentLabel, labels } = getNameLabels(name)

  const [nameRolesQuery] = useQueries({
    queries: [
      {
        ...getNameRolesAccountsQueryOptions({
          label: currentLabel,
          registryAddress,
          fromBlock: ROLES_FROM_BLOCK,
        }),
        enabled: labels.length >= 2,
      },
    ],
  })

  if (nameRolesQuery.isLoading)
    return <LoadingSpinner title="Loading role accounts" />

  if (nameRolesQuery.error)
    return (
      <ErrorMessage
        title="Failed to fetch role accounts"
        description={nameRolesQuery.error.cause?.message}
      />
    )

  if (!nameRolesQuery.data) return <NoResultsMessage title="No role accounts" />

  return (
    <RolesTable
      roles={nameRolesQuery.data}
      name={name}
      canManageRoles={canManageRoles}
      registryAddress={registryAddress}
    />
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

export const NameRolesOverviewTable = ({ name }: { name: string }) => {
  const [addUserOpen, setAddUserOpen] = useState(false)

  const { address } = useConnection()
  const labels = name.split('.')
  const label = labels[0]

  const { data, isLoading, error } = useQuery({
    ...getEnsOwnerQueryOptions({ name }),
    enabled: name.endsWith('.eth'),
  })

  const registryAddress = data?.registryAddress

  const { data: currentAccountRoles } = useQuery({
    ...getNameRolesForAccountQueryOptions({
      registryAddress: registryAddress ?? ensRegistryAddress,
      label,
      account: address ?? zeroAddress,
    }),
    enabled:
      Boolean(address) &&
      Boolean(registryAddress) &&
      data?.protocolVersion === 'ENSv2',
  })

  const canManageRoles = Boolean(
    currentAccountRoles?.decoded?.find(isAdminRole),
  )

  if (isLoading) return <LoadingSpinner title="Loading name owner" />

  if (error)
    return (
      <ErrorMessage
        title={error.cause?.name}
        description={error.cause?.message}
      />
    )

  if (!registryAddress) return null

  return (
    <Fragment>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium leading-none uppercase">
          parent registry roles
        </h3>
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
      <RolesAddUserSheet
        open={addUserOpen}
        onOpenChange={setAddUserOpen}
        name={name}
        registryAddress={registryAddress}
      />
    </Fragment>
  )
}
