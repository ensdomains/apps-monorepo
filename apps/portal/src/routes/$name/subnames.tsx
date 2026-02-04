import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { AlertCircle, Search } from 'lucide-react'
import { type Address, zeroAddress } from 'viem'
import { useAccount } from 'wagmi'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { SortButton } from '@/components/table/SortButton'
import { Button } from '@/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  type SubnameRow,
  SubnamesTable,
} from '@/features/names/components/SubnamesTable'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getSubnamesQueryOptions } from '@/features/profile/hooks/useSubnames'
import { getHasRolesQueryOptions } from '@/features/registry/hooks/useHasRoles'
import { getNameRegistriesQueryOptions } from '@/features/registry/hooks/useNameRegistryDiscovery'

export const Route = createFileRoute('/$name/subnames')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

interface NoSubregistryMessageProps {
  readonly name: string
}

const NoSubregistryMessage = ({ name }: NoSubregistryMessageProps) => (
  <>
    <header className="bg-gray-100 px-6 pb-6 pt-12 flex flex-col gap-4 sticky top-0 z-10">
      <h1 className="text-[30px] font-medium leading-tight">Subnames</h1>
      <InputGroup className="bg-white rounded-sm">
        <InputGroupInput className="w-full" placeholder="Search..." disabled />
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
      </InputGroup>
    </header>

    <Table className="relative">
      <TableHeader>
        <TableRow>
          <TableHead className="px-6 py-2">
            <SortButton disabled>Subname</SortButton>
          </TableHead>
          <TableHead className="px-6 py-2">
            <SortButton disabled>Owner</SortButton>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell colSpan={2} className="px-6 py-6">
            <div className="flex flex-row items-center gap-4">
              <AlertCircle className="size-6 text-gray-500 shrink-0" />
              <p className="flex-1">
                This name does not have a subregistry. You must deploy one to
                create subnames.
              </p>
              <Button asChild variant="secondary">
                <Link to="/$name/registry" params={{ name }}>
                  Deploy subregistry
                </Link>
              </Button>
            </div>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </>
)

interface V2SubnamesContentProps {
  readonly name: string
  readonly network: 'namechainSepolia'
}

const V2SubnamesContent = ({ name, network }: V2SubnamesContentProps) => {
  const { address: connectedAccount } = useAccount()

  const {
    data: registriesData,
    isLoading: registriesLoading,
    error: registriesError,
  } = useQuery(getNameRegistriesQueryOptions({ name, network }))

  // The subregistry is always the first element (index 0) in the registries array
  // For 2LD "foo.eth": [subregistry, ethRegistry, root]
  // For 3LD "sub.foo.eth": [subregistry, fooRegistry, ethRegistry, root]
  const subregistryAddress = registriesData?.registries[0]
  const hasSubregistry =
    subregistryAddress && subregistryAddress !== zeroAddress

  // Check if connected account has ROLE_REGISTRAR on the subregistry ROOT resource
  const { data: hasRegistrarRole } = useQuery({
    ...getHasRolesQueryOptions({
      registryAddress: subregistryAddress as Address,
      label: '',
      roles: ['ROLE_REGISTRAR'],
      account: connectedAccount as Address,
    }),
    enabled: Boolean(hasSubregistry) && Boolean(connectedAccount),
  })

  const {
    data: subnames,
    isLoading: subnamesLoading,
    error: subnamesError,
  } = useQuery({
    ...getSubnamesQueryOptions({ name, network }),
    enabled: Boolean(hasSubregistry),
  })

  if (registriesLoading) {
    return <LoadingMessage title="Checking registry..." />
  }

  if (registriesError) {
    return (
      <ErrorMessage
        title="Failed to load registry"
        description={registriesError.cause?.message || registriesError.message}
      />
    )
  }

  if (!hasSubregistry) {
    return <NoSubregistryMessage name={name} />
  }

  if (subnamesLoading) {
    return <LoadingMessage title="Loading subnames..." />
  }

  if (subnamesError) {
    return (
      <ErrorMessage
        title="Failed to load subnames"
        description={subnamesError.cause?.message || subnamesError.message}
      />
    )
  }

  const subnameRows: SubnameRow[] = (subnames || []).map((subname) => ({
    name: subname.name || '',
    owner: subname.owner,
  }))

  const canCreateSubname = Boolean(hasRegistrarRole)

  return (
    <SubnamesTable
      subnames={subnameRows}
      name={name}
      canCreateSubname={canCreateSubname}
    />
  )
}

const V1SubnamesMessage = () => (
  <div className="max-w-360 w-full mx-auto flex flex-col gap-4 p-6">
    <h1 className="text-[28px] font-medium">Subnames</h1>
    <div className="bg-gray-50 rounded-lg p-8 text-center">
      <p className="text-gray-600">This page is only for ENSv2 names.</p>
      <p className="text-gray-500 text-sm mt-2">
        ENSv1 subnames are managed differently.
      </p>
    </div>
  </div>
)

function RouteComponent() {
  const { name } = Route.useParams()

  const {
    data: ownerData,
    isLoading,
    error,
  } = useQuery(getEnsOwnerQueryOptions({ name }))

  if (error) {
    return (
      <ErrorMessage
        title="Failed to fetch name data"
        description={error.cause.message}
      />
    )
  }

  if (isLoading) {
    return <LoadingMessage title="Loading name data..." />
  }

  if (!ownerData) {
    return <NotFoundMessage />
  }

  // V1 names (sepolia network) - show message
  if (ownerData.network === 'sepolia') {
    return <V1SubnamesMessage />
  }

  // V2 names (namechainSepolia network)
  return <V2SubnamesContent name={name} network={ownerData.network} />
}
