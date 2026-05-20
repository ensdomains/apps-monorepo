import { useQueries, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { ClockIcon } from 'lucide-react'
import { ExternalLink } from 'react-external-link'
import { type Address, isAddressEqual, namehash, zeroAddress } from 'viem'
import { sepolia } from 'viem/chains'
import { useConnection } from 'wagmi'
import { getEnsResolverQueryOptions } from 'wagmi/query'
import { AssuredWorkloadIcon, EditNoteIcon } from '@/assets/icons'
import { EntityBadge } from '@/components/EntityBadge'
import { ErrorMessage } from '@/components/ErrorMessage'
import { InfoCard, InfoRow } from '@/components/InfoCard'
import { LoadingMessage } from '@/components/LoadingMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  type GetEnsOwnerReturnType,
  getEnsOwnerQueryOptions,
} from '@/features/profile/hooks/useEnsOwner'
import { getV2NameHistoryQueryOptions } from '@/features/profile/hooks/useV2NameHistory'
import { getHasRolesQueryOptions } from '@/features/registry/hooks/useHasRoles'
import { getIsPermissionedResolverQueryOptions } from '@/features/resolver/hooks/useIsPermissionedResolver'
import { getResolverOverviewQueryOptions } from '@/features/resolver/hooks/useResolverOverview'
import { getSupportsInterfacesQueryOptions } from '@/hooks/useSupportsInterfaces'
import {
  RESOLVER_FEATURES,
  RESOLVER_INTERFACE_IDS,
  type ResolverInterfaceName,
} from '@/lib/constants/resolverInterfaceIds'
import { universalResolverAddress } from '@/lib/constants/universalResolver'
import { wagmiConfig } from '@/lib/wagmi'
import { extractErrorMessage } from '@/utils/errors/extractErrorMessage'
import { transformV2EventsToSubgraphFormat } from '@/utils/history/transformV2Events'
import { NameSubgraphHistory } from '../../components/table/NameSubgraphHistory/NameSubgraphHistory'

export const Route = createFileRoute('/$name/resolver')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

const sepoliaUrl = sepolia.blockExplorers.default.url

const officialPublicResolverAddress =
  '0x640294a2b2d87e7f522db3e3e3e876764bce170d' as Address

const interfaceNamesById = Object.entries(RESOLVER_INTERFACE_IDS).map(
  ([name, value]) => [value, name as ResolverInterfaceName] as const,
)

interface EditButtonsProps {
  address: Address
  name: string
  resolverAddress?: Address
  registryAddress: Address
}

const EditButtons = ({
  address,
  name,
  resolverAddress,
  registryAddress,
}: EditButtonsProps) => {
  const label = name.split('.')[0]
  const { data: hasSetResolverRole } = useQuery({
    ...getHasRolesQueryOptions({
      registryAddress,
      label,
      roles: ['ROLE_SET_RESOLVER'],
      account: address,
    }),
  })

  if (!hasSetResolverRole) return null
  if (!resolverAddress || resolverAddress === zeroAddress) return null

  return (
    <Button variant="default" className="flex items-center gap-2" asChild>
      <Link to="/$name/change-resolver" params={{ name }}>
        <EditNoteIcon className="size-4" />
        Change resolver
      </Link>
    </Button>
  )
}

const ResolverBanner = ({
  name,
  docsHref,
}: {
  name: 'ENS Permissioned Resolver' | 'ENS Public Resolver'
  docsHref: string
}) => {
  return (
    <div className="flex items-start gap-3 p-6 self-stretch rounded-sm bg-message-success-fill">
      <AssuredWorkloadIcon className="size-6 shrink-0 text-message-success-text mt-0.5" />
      <div className="flex flex-col gap-1">
        <span
          className="font-serif font-[350] leading-none tracking-[-0.6px]"
          style={{
            color: 'var(--message-success-text, #105C23)',
            fontSize: 'var(--3xl, 30px)',
          }}
        >
          {name}
        </span>
        <p className="text-sm text-message-success-text">
          This resolver is an instance of the official{' '}
          <ExternalLink
            href={docsHref}
            className="underline decoration-dashed underline-offset-4"
          >
            ENS {name}
          </ExternalLink>
          . This resolver has been audited and is considered secure.
        </p>
      </div>
    </div>
  )
}

const ResolverAddressValue = ({ address }: { address: Address }) => (
  <EntityBadge
    variant="contract"
    address={address}
    etherscanHref={`${sepoliaUrl}/address/${address}`}
    className="max-w-full truncate"
  >
    {address}
  </EntityBadge>
)

const FeatureLinks = ({ resolverAddress }: { resolverAddress: Address }) => {
  const { data, isLoading, error } = useQuery(
    getSupportsInterfacesQueryOptions({
      address: resolverAddress,
      interfaces: Object.values(RESOLVER_INTERFACE_IDS),
    }),
  )

  if (isLoading) return <LoadingSpinner title="Loading interfaces..." />
  if (error)
    return (
      <div className="text-sm text-destructive">{error.cause?.message}</div>
    )
  if (!data) return <div className="text-sm text-muted-foreground">No data</div>

  const features = data
    .flatMap((supported, index) => {
      if (!supported) return []
      const [, name] = interfaceNamesById[index] ?? []
      if (!name) return []
      const feature = RESOLVER_FEATURES[name]
      if (!feature) return []
      return [feature]
    })
    .filter((feature, index, list) => {
      return list.findIndex((item) => item.name === feature.name) === index
    })

  if (features.length === 0)
    return (
      <div className="text-sm text-muted-foreground">
        No interfaces detected
      </div>
    )

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
      {features.map((feature) => (
        <ExternalLink
          key={feature.name}
          href={feature.link}
          className="underline decoration-dotted underline-offset-4 transition-colors hover:text-primary"
        >
          {feature.name}
        </ExternalLink>
      ))}
    </div>
  )
}

const ResolverInfoCard = ({
  resolverAddress,
  name,
  type,
}: {
  resolverAddress: Address
  name: string
  type: string
}) => {
  const { data: resolver } = useQuery(
    getResolverOverviewQueryOptions({ address: resolverAddress }),
  )
  const isAliased = resolver?.aliases.some((a) => a.fromName === name) ?? false
  const nodeHash = namehash(name)

  return (
    <InfoCard title="Resolver info">
      <InfoRow label="Type">
        <span className="text-sm">{type}</span>
      </InfoRow>
      <InfoRow label="Contract">
        <ResolverAddressValue address={resolverAddress} />
      </InfoRow>
      <InfoRow label="Node">
        <div className="flex items-center gap-2">
          <EntityBadge variant="name" name={name} showAvatar>
            {name}
          </EntityBadge>
          {isAliased && <Badge variant="outline">Aliased</Badge>}
        </div>
      </InfoRow>
      <InfoRow label="Namehash">
        <span className="font-mono text-sm break-all">{nodeHash}</span>
      </InfoRow>
      <InfoRow label="Interfaces">
        <div>
          <FeatureLinks resolverAddress={resolverAddress} />
        </div>
      </InfoRow>
    </InfoCard>
  )
}

const PermissionedResolverView = ({
  name,
  resolverAddress,
}: {
  name: string
  resolverAddress: Address
}) => (
  <ResolverInfoCard
    name={name}
    resolverAddress={resolverAddress}
    type="Permissioned Resolver"
  />
)

const PublicResolverView = ({
  name,
  resolverAddress,
}: {
  name: string
  resolverAddress: Address
}) => (
  <ResolverInfoCard
    name={name}
    resolverAddress={resolverAddress}
    type="ENS Public Resolver"
  />
)

const CustomResolverView = ({
  name,
  resolverAddress,
}: {
  name: string
  resolverAddress: Address
}) => (
  <ResolverInfoCard
    name={name}
    resolverAddress={resolverAddress}
    type="Custom Resolver"
  />
)

const HistorySection = ({
  name,
  protocolVersion,
}: {
  name: string
  protocolVersion: NonNullable<GetEnsOwnerReturnType>['protocolVersion']
}) => {
  const v2HistoryQuery = useQuery({
    ...getV2NameHistoryQueryOptions({ name }),
    enabled: protocolVersion === 'ENSv2',
  })

  if (protocolVersion === 'ENSv2') {
    if (v2HistoryQuery.isLoading) {
      return <LoadingSpinner title="Loading history..." />
    }

    if (v2HistoryQuery.error) {
      return (
        <div className="text-sm text-destructive">
          {v2HistoryQuery.error.cause?.message || v2HistoryQuery.error.message}
        </div>
      )
    }

    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-medium">History</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/$name/history" params={{ name }}>
              <ClockIcon className="size-4" />
              Full history
            </Link>
          </Button>
        </div>
        <NameSubgraphHistory
          name={name}
          v2Events={transformV2EventsToSubgraphFormat(
            v2HistoryQuery.data || [],
          )}
          enableHeader={false}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-medium">History</h2>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/$name/history" params={{ name }}>
            <ClockIcon className="size-4" />
            Full history
          </Link>
        </Button>
      </div>
      <NameSubgraphHistory name={name} enableHeader={false} />
    </div>
  )
}

interface ResolverViewProps {
  name: string
  ownerData: NonNullable<GetEnsOwnerReturnType>
  resolverAddress: Address
}

const ResolverView = ({
  name,
  ownerData,
  resolverAddress,
}: ResolverViewProps) => {
  const { address } = useConnection()
  const permissionedResolverQuery = useQuery(
    getIsPermissionedResolverQueryOptions({ resolverAddress }),
  )

  const isOfficialPublicResolver = isAddressEqual(
    resolverAddress,
    officialPublicResolverAddress,
  )

  if (permissionedResolverQuery.isLoading) {
    return <LoadingSpinner title="Loading resolver info..." />
  }

  if (permissionedResolverQuery.error) {
    return (
      <ErrorMessage
        title="Error loading resolver details"
        description={String(permissionedResolverQuery.error.cause ?? '')}
      />
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-360 flex-col gap-6 p-4 sm:p-6">
      {permissionedResolverQuery.data ? (
        <ResolverBanner
          name="ENS Permissioned Resolver"
          docsHref="https://github.com/ensdomains/contracts-v2/blob/main/contracts/src/resolver/PermissionedResolver.sol"
        />
      ) : isOfficialPublicResolver ? (
        <ResolverBanner
          name="ENS Public Resolver"
          docsHref="https://docs.ens.domains/resolvers/public/"
        />
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-heading font-medium">Resolver</h1>
        {address ? (
          <EditButtons
            address={address}
            name={name}
            resolverAddress={resolverAddress}
            registryAddress={ownerData.registryAddress}
          />
        ) : null}
      </div>

      {permissionedResolverQuery.data ? (
        <PermissionedResolverView
          name={name}
          resolverAddress={resolverAddress}
        />
      ) : isOfficialPublicResolver ? (
        <PublicResolverView name={name} resolverAddress={resolverAddress} />
      ) : (
        <CustomResolverView name={name} resolverAddress={resolverAddress} />
      )}

      <HistorySection name={name} protocolVersion={ownerData.protocolVersion} />
    </div>
  )
}

const SetResolverButton = ({
  account,
  registryAddress,
  name,
}: {
  account: Address
  registryAddress: Address
  name: string
}) => {
  const label = name.split('.')[0]
  const { data: hasSetResolverRole } = useQuery(
    getHasRolesQueryOptions({
      registryAddress,
      label,
      roles: ['ROLE_SET_RESOLVER'],
      account,
    }),
  )

  if (!hasSetResolverRole) return null

  return (
    <Button variant="default" className="flex items-center gap-2" asChild>
      <Link to="/$name/change-resolver" params={{ name }}>
        <EditNoteIcon className="size-4" />
        Set resolver
      </Link>
    </Button>
  )
}

const NoResolverSet = ({
  name,
  registryAddress,
}: {
  name: string
  registryAddress: Address
}) => {
  const { address: account } = useConnection()

  return (
    <div className="mx-auto flex w-full max-w-360 flex-col gap-6 p-4 sm:p-6">
      <h1 className="text-heading font-medium">Resolver</h1>
      <div className="flex items-center gap-4 rounded-sm bg-accent-fill/40 p-6">
        <p className="flex-1 text-base text-muted-foreground">
          This name does not have a resolver set.
        </p>
        {account && (
          <SetResolverButton
            name={name}
            account={account}
            registryAddress={registryAddress}
          />
        )}
      </div>
    </div>
  )
}

function RouteComponent() {
  const { name } = useParams({ from: '/$name/resolver' })

  const [ownerQuery, resolverQuery] = useQueries({
    queries: [
      getEnsOwnerQueryOptions({ name }),
      getEnsResolverQueryOptions(wagmiConfig, {
        name,
        universalResolverAddress,
      }),
    ],
  })

  if (ownerQuery.error) {
    return (
      <ErrorMessage
        title={ownerQuery.error.cause.name}
        description={ownerQuery.error.cause.message}
      />
    )
  }

  if (resolverQuery.error) {
    if (resolverQuery.error.name === 'ChainDoesNotSupportContract')
      return <ErrorMessage title="Chain does not have UniversalResolver" />
    return (
      <ErrorMessage
        title="Error loading resolver"
        description={extractErrorMessage(resolverQuery.error, '')}
      />
    )
  }

  if (ownerQuery.isLoading) return <LoadingMessage />
  if (resolverQuery.isLoading) return <LoadingMessage />

  if (!ownerQuery.data)
    return (
      <NotFoundMessage
        title="Name not registered"
        description={
          <>
            <strong>{name}</strong> is not registered, so there is no resolver
            data to display.
          </>
        }
      />
    )

  const resolverAddress = resolverQuery.data

  if (resolverAddress) {
    if (resolverAddress === zeroAddress) {
      return (
        <NoResolverSet
          name={name}
          registryAddress={ownerQuery.data.registryAddress}
        />
      )
    }
    return (
      <ResolverView
        name={name}
        ownerData={ownerQuery.data}
        resolverAddress={resolverAddress}
      />
    )
  }

  return (
    <ErrorMessage
      title="Unable to load resolver"
      description="Could not find resolver address."
    />
  )
}
