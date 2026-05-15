import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { useQueries, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { type Address, zeroAddress } from 'viem'
import { useConnection } from 'wagmi'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { Button } from '@/components/ui/button'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getNameLabels } from '@/features/registry/utils/nameUtils'
import { RoleHistoryTable } from '@/features/roles/components/RoleHistoryTable'
import { RolesTable } from '@/features/roles/components/RolesTable'
import { getNameRolesAccountsQueryOptions } from '@/features/roles/hooks/useNameRoleAccounts'
import { getNameRolesForAccountQueryOptions } from '@/features/roles/hooks/useNameRolesForAccount'
import { sepoliaWithEns } from '@/lib/wagmi'

const ensRegistryAddress = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensRegistry',
})

export const Route = createFileRoute('/$name/roles/')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

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
          fromBlock: 9783977n,
        }),
        enabled: labels.length >= 2,
      },
    ],
  })

  if (nameRolesQuery.isLoading)
    return <LoadingSpinner title="Loading role accounts" />

  if (nameRolesQuery.error)
    return (
      <div>
        Failed to fetch role accounts: {nameRolesQuery.error.cause?.message}
      </div>
    )

  if (!nameRolesQuery.data) return 'No data'

  return (
    <div className="flex flex-col gap-8">
      <RolesTable
        roles={nameRolesQuery.data}
        name={name}
        canManageRoles={canManageRoles}
        registryAddress={registryAddress}
      />
      <div className="flex flex-col gap-4">
        <h2 className="text-xl font-medium">Role History</h2>
        <RoleHistoryTable name={name} label={currentLabel} />
      </div>
    </div>
  )
}

const AddUserButton = ({
  name,
  canManageRoles,
}: {
  name: string
  canManageRoles: boolean
}) => {
  if (!canManageRoles) return null

  return (
    <Button variant="default" className="flex items-center gap-2" asChild>
      <Link to="/$name/roles/add-user" params={{ name }}>
        <Plus className="size-4" />
        Add user
      </Link>
    </Button>
  )
}

function RouteComponent() {
  const { name } = Route.useParams()

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
    currentAccountRoles?.decoded?.find((role) => role.endsWith('_ADMIN')),
  )

  if (!name.endsWith('.eth') || (labels.length !== 2 && labels.length !== 3))
    return <ErrorMessage title="Only 2LD and 3LD .eth names are supported" />
  if (isLoading) return <LoadingSpinner title="Loading name owner" />
  if (error)
    return (
      <ErrorMessage
        title={error.cause?.name}
        description={error.cause?.message}
      />
    )

  if (data?.protocolVersion === 'ENSv2') {
    if (!registryAddress) {
      return (
        <ErrorMessage
          title="No registry"
          description="Unable to determine the registry for this name."
        />
      )
    }

    return (
      <div className="max-w-360 w-full mx-auto flex flex-col gap-6 m-6 px-4">
        <div className="flex items-center justify-between">
          <h1 className="text-heading font-medium leading-none">Roles</h1>
          {address && (
            <AddUserButton name={name} canManageRoles={canManageRoles} />
          )}
        </div>
        <V2NameRoles
          name={name}
          registryAddress={registryAddress}
          canManageRoles={canManageRoles}
        />
      </div>
    )
  } else
    return (
      <ErrorMessage
        title="This is not an ENSv2 name"
        description="Role editing is supported only for ENSv2 names at the moment."
      />
    )
}
