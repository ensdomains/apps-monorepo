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
import { RolesTable } from '@/features/roles/components/RolesTable'
import { getNameRolesAccountsQueryOptions } from '@/features/roles/hooks/useNameRoleAccounts'
import { getNameRolesForAccountQueryOptions } from '@/features/roles/hooks/useNameRolesForAccount'
import { namechainEthRegistryAddress } from '@/lib/constants/registry'

export const Route = createFileRoute('/$name/roles/')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

const V2NameRoles = ({
  name,
  registryAddress,
  canManageRoles,
  owner,
}: {
  name: string
  registryAddress: Address
  canManageRoles: boolean
  owner?: Address
}) => {
  const { currentLabel, labels } = getNameLabels(name)

  const [nameRolesQuery] = useQueries({
    queries: [
      {
        ...getNameRolesAccountsQueryOptions({
          label: currentLabel,
          registryAddress,
          fromBlock: 9783977n, // to test with raffy.eth
        }),
        enabled: labels.length === 2,
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
    <RolesTable
      roles={nameRolesQuery.data}
      name={name}
      canManageRoles={canManageRoles}
      owner={owner}
    />
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
    <Button variant="secondary" className="flex items-center gap-2" asChild>
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
  const label = name.split('.')[0]

  const { data, isLoading, error } = useQuery({
    ...getEnsOwnerQueryOptions({ name }),
    enabled: name.endsWith('.eth'),
  })

  const { data: currentAccountRoles } = useQuery({
    ...getNameRolesForAccountQueryOptions({
      registryAddress: data?.registryAddress ?? namechainEthRegistryAddress,
      label,
      account: address ?? zeroAddress,
    }),
    enabled:
      Boolean(address) &&
      Boolean(data?.registryAddress) &&
      data?.network === 'namechainSepolia',
  })

  const canManageRoles = Boolean(
    currentAccountRoles?.decoded.find((role) => role.endsWith('_ADMIN')),
  )

  if (!name.endsWith('.eth') || name.split('.').length !== 2)
    return <ErrorMessage title="Only 2LD .eth is supported" />
  if (isLoading) return <LoadingSpinner title="Loading name owner" />
  if (error)
    return (
      <ErrorMessage
        title={error.cause?.name}
        description={error.cause?.message}
      />
    )

  if (data?.network === 'namechainSepolia') {
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
          registryAddress={data.registryAddress}
          canManageRoles={canManageRoles}
          owner={data.owner}
        />
      </div>
    )
  } else
    return (
      <ErrorMessage
        title="This is not a Namechain name"
        description="Role editing is supported only for Namechain names at the moment."
      />
    )
}
