import { useQueries, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { Address } from 'viem'
import { ErrorMessage } from '@/components/molecules/ErrorMessage'
import { LoadingSpinner } from '@/components/molecules/LoadingSpinner'
import { NotFoundMessage } from '@/components/molecules/NotFoundMessage'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getNameLabels } from '@/features/registry/utils/nameUtils'
import { RolesTable } from '@/features/roles/components/RolesTable'
import { getNameRolesAccountsQueryOptions } from '@/features/roles/hooks/useNameRoleAccounts'

export const Route = createFileRoute('/$name/roles')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

const V2NameRoles = ({
  name,
  registryAddress,
}: {
  name: string
  registryAddress: Address
}) => {
  const { currentLabel, labels } = getNameLabels(name)

  const [nameRolesQuery] = useQueries({
    queries: [
      {
        ...getNameRolesAccountsQueryOptions({
          label: currentLabel,
          registryAddress,
          fromBlock: 9683977n, // to test with raffy.eth
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

  return <RolesTable roles={nameRolesQuery.data} />
}

function RouteComponent() {
  const { name } = Route.useParams()

  const { data, isLoading, error } = useQuery(getEnsOwnerQueryOptions({ name }))

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
      <div className="max-w-5xl w-full mx-auto flex flex-col gap-6 m-6 px-4">
        <h1 className="text-3xl font-medium">Roles</h1>
        <V2NameRoles name={name} registryAddress={data.registryAddress} />
      </div>
    )
  } else return <div>This a ENSv1 Name</div>
}
