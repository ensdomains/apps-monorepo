import { useQueries, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import type { GetEnsResolverErrorType } from '@wagmi/core'
import { ClockIcon } from 'lucide-react'
import { ExternalLink } from 'react-external-link'
import { type Address, isAddressEqual, namehash, zeroAddress } from 'viem'
import { sepolia } from 'viem/chains'
import { useConnection } from 'wagmi'
import { getEnsResolverQueryOptions } from 'wagmi/query'
import { EditNoteIcon } from '@/assets/icons'
import { EntityBadge } from '@/components/EntityBadge'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { NameNotRegisteredMessage } from '@/components/NameNotRegisteredMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { PageHeading } from '@/components/PageHeading'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useDnsOffchainName } from '@/features/dns-import/hooks/useDnsOffchainName'
import { HistoryTimeline } from '@/features/history/components/HistoryTimeline'
import { InfoRow } from '@/features/profile/components/InfoRow'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getNameAvailabilityQueryOptions } from '@/features/profile/hooks/useNameAvailability'
import { getHasRolesQueryOptions } from '@/features/registry/hooks/useHasRoles'
import { getIsPermissionedResolverQueryOptions } from '@/features/resolver/hooks/useIsPermissionedResolver'
import { getResolverOverviewQueryOptions } from '@/features/resolver/hooks/useResolverOverview'
import { getSupportsInterfacesQueryOptions } from '@/hooks/useSupportsInterfaces'
import {
  RESOLVER_FEATURES,
  RESOLVER_INTERFACE_IDS,
  type ResolverInterfaceName,
} from '@/lib/constants/resolverInterfaceIds'
import {
  officialPublicResolverAddress,
  universalResolverAddress,
} from '@/lib/constants/universalResolver'
import { wagmiConfig } from '@/lib/wagmi'
import { isRegistrable } from '@/utils/ens/tldHelpers'
import { extractErrorMessage } from '@/utils/errors/extractErrorMessage'

export const Route = createFileRoute('/$name/resolver')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

const sepoliaUrl = sepolia.blockExplorers.default.url

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
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-p text-foreground">
      {features.map((feature) => (
        <ExternalLink
          key={feature.name}
          href={feature.link}
          className="underline transition-colors hover:text-primary"
        >
          {feature.name}
        </ExternalLink>
      ))}
    </div>
  )
}

const ResolverInfoList = ({
  resolverAddress,
  name,
  type,
  docsHref,
}: {
  resolverAddress: Address
  name: string
  type: string
  /** Official-resolver docs link — renders the audited notice in the Type row. */
  docsHref?: string
}) => {
  const { data: resolver } = useQuery(
    getResolverOverviewQueryOptions({ address: resolverAddress }),
  )
  const isAliased = resolver?.aliases.some((a) => a.fromName === name) ?? false
  const nodeHash = namehash(name)

  return (
    <div className="flex flex-col">
      <InfoRow label="Type">
        {docsHref ? (
          <p className="text-p text-foreground">
            This is an instance of the official{' '}
            <ExternalLink href={docsHref} className="underline">
              {type}
            </ExternalLink>
            . It is audited and is considered secure.
          </p>
        ) : (
          <span className="text-ui text-foreground">{type}</span>
        )}
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
        <span className="text-entity-base text-foreground break-all">
          {nodeHash}
        </span>
      </InfoRow>
      <InfoRow label="Interfaces">
        <div>
          <FeatureLinks resolverAddress={resolverAddress} />
        </div>
      </InfoRow>
    </div>
  )
}

const RESOLVER_HISTORY_EVENT_TYPES = [
  'ResolverUpdated',
  'AddressChanged',
  'AddrChanged',
  'TextChanged',
  'ContenthashChanged',
  'NameChanged',
] as const

interface ResolverViewProps {
  name: string
  /** Undefined for a gasless DNS name: no registry entry, nothing to edit. */
  registryAddress: Address | undefined
  resolverAddress: Address
}

const ResolverView = ({
  name,
  registryAddress,
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
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeading parent={{ type: 'name', name }}>Resolver</PageHeading>
        {address && registryAddress ? (
          <EditButtons
            address={address}
            name={name}
            resolverAddress={resolverAddress}
            registryAddress={registryAddress}
          />
        ) : null}
      </div>

      {permissionedResolverQuery.data ? (
        <ResolverInfoList
          name={name}
          resolverAddress={resolverAddress}
          type="ENS Permissioned Resolver"
          docsHref="https://github.com/ensdomains/contracts-v2/blob/main/contracts/src/resolver/PermissionedResolver.sol"
        />
      ) : isOfficialPublicResolver ? (
        <ResolverInfoList
          name={name}
          resolverAddress={resolverAddress}
          type="ENS Public Resolver"
          docsHref="https://docs.ens.domains/resolvers/public/"
        />
      ) : (
        <ResolverInfoList
          name={name}
          resolverAddress={resolverAddress}
          type="Custom Resolver"
        />
      )}

      <HistoryTimeline
        name={name}
        scope={RESOLVER_HISTORY_EVENT_TYPES}
        showFilters={false}
        emptyTitle="No resolver history"
        emptyDescription="Resolver changes and record writes for this name will appear here as they happen."
        heading={<h2 className="text-caps text-foreground">History</h2>}
        action={
          <Button variant="outline" size="xs" asChild>
            <Link to="/$name/history" params={{ name }}>
              <ClockIcon className="size-4" />
              Full history
            </Link>
          </Button>
        }
      />
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
  registryAddress: Address | undefined
}) => {
  const { address: account } = useConnection()

  return (
    <div className="flex flex-col gap-8">
      <PageHeading parent={{ type: 'name', name }}>Resolver</PageHeading>
      <div className="flex items-center gap-4 rounded-sm bg-accent-fill/40 p-6">
        <p className="flex-1 text-base text-muted-foreground">
          This name does not have a resolver set.
        </p>
        {account && registryAddress && (
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
      {
        ...getEnsResolverQueryOptions(wagmiConfig, {
          name,
          universalResolverAddress,
        }),
        // useQueries reads each query's error type off `throwOnError`, and
        // wagmi's factory returns query-core options, which have no such field
        // — so TError falls back to DefaultError and collides with the
        // factory's own `retry: RetryValue<GetEnsResolverErrorType>`. Naming
        // the error here is what restores the narrowed type the
        // ChainDoesNotSupportContract branch below reads. `false` is already
        // the default, so behaviour is unchanged.
        throwOnError: (_error: GetEnsResolverErrorType) => false,
      },
    ],
  })

  // Whether the name is registered is a chain-state question: the v2 registry
  // keeps returning the previous owner (latestOwner) after expiry, so use the
  // registrar's availability (true only past grace) instead of owner presence.
  const availabilityQuery = useQuery({
    ...getNameAvailabilityQueryOptions({ name }),
    enabled: isRegistrable(name),
  })

  // A gasless DNS name has no registry entry by design, yet the
  // UniversalResolver still finds a resolver for it (by wildcard).
  const offchain = useDnsOffchainName({ name, owner: ownerQuery.data })

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

  if (
    ownerQuery.isLoading ||
    resolverQuery.isLoading ||
    offchain.isLoading ||
    (availabilityQuery.isLoading && isRegistrable(name))
  )
    return <LoadingMessage />

  if (availabilityQuery.error) {
    return (
      <ErrorMessage
        title="Error checking availability"
        description={
          availabilityQuery.error.cause?.message ||
          availabilityQuery.error.message
        }
      />
    )
  }

  if (
    availabilityQuery.data?.isAvailable ||
    (!ownerQuery.data && !offchain.resolvedAddress)
  )
    return (
      <NameNotRegisteredMessage
        name={name}
        description={
          <>
            <strong>{name}</strong> is not registered, so there is no resolver
            data to display.
          </>
        }
      />
    )

  const resolverAddress = resolverQuery.data
  const registryAddress = ownerQuery.data?.registryAddress

  if (resolverAddress) {
    if (resolverAddress === zeroAddress) {
      return <NoResolverSet name={name} registryAddress={registryAddress} />
    }
    return (
      <ResolverView
        name={name}
        registryAddress={registryAddress}
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
