import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { AlertCircle, Info } from 'lucide-react'
import { type Address, zeroAddress } from 'viem'
import { useAccount } from 'wagmi'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { MessageCard } from '@/components/ui/message-card'
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
  readonly canDeploy: boolean
}

const NoSubregistryMessage = ({
  name,
  canDeploy,
}: NoSubregistryMessageProps) => (
  <MessageCard
    icon={<AlertCircle size={30} strokeWidth={1.5} className="text-gray-500" />}
    title="No subregistry"
    description={
      <p>
        This name does not have a subregistry.
        <br />
        {canDeploy
          ? 'You must deploy one to create subnames.'
          : 'You do not have permission to deploy one.'}
      </p>
    }
    actionButton={
      canDeploy
        ? {
            label: 'Deploy subregistry',
            variant: 'default',
            href: `/${name}/registry`,
          }
        : undefined
    }
  />
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

  // Check if connected account can deploy a subregistry (ROLE_SET_SUBREGISTRY on parent registry)
  const parentRegistryAddress = registriesData?.registries[1]
  const firstLabel = name.split('.')[0]
  const { data: hasSetSubregistryRole } = useQuery({
    ...getHasRolesQueryOptions({
      registryAddress: parentRegistryAddress as Address,
      label: firstLabel,
      roles: ['ROLE_SET_SUBREGISTRY'],
      account: connectedAccount as Address,
    }),
    enabled:
      Boolean(parentRegistryAddress) &&
      Boolean(connectedAccount) &&
      !hasSubregistry,
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
    return (
      <NoSubregistryMessage
        name={name}
        canDeploy={Boolean(hasSetSubregistryRole)}
      />
    )
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
  <MessageCard
    icon={<Info size={30} strokeWidth={1.5} />}
    title="ENSv1 Name"
    description={
      <>
        <p>This page is only for ENSv2 names.</p>
        <p className="text-gray-500 text-sm mt-2">
          ENSv1 subnames are managed differently.
        </p>
      </>
    }
  />
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
