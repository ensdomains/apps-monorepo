import { useQueries, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import type { Address } from 'viem'
import { ErrorMessage } from '@/components/molecules/ErrorMessage'
import { LoadingSpinner } from '@/components/molecules/LoadingSpinner'
import { NotFoundMessage } from '@/components/molecules/NotFoundMessage'
import { Button } from '@/components/ui/button'
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
      <div className="max-w-360 w-full mx-auto flex flex-col gap-6 m-6 px-4">
        <div className="flex items-center justify-between">
          <h1 className="text-[28px] font-medium leading-none">Roles</h1>
          <Button variant="outline" className="flex items-center gap-2" asChild>
            <a href={`/${name}/add-user`}>
              <Plus className="size-4" />
              Add user
            </a>
          </Button>
        </div>
        <V2NameRoles name={name} registryAddress={data.registryAddress} />
      </div>
    )
  } else return <div>This a ENSv1 Name</div>
}
