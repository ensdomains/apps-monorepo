import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { useQueries, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import {
  ClockIcon,
  EditIcon,
  FocusIcon,
  GitBranchIcon,
  InfoIcon,
  ShieldCheckIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { ExternalLink } from 'react-external-link'
import { type Address, isAddressEqual, zeroAddress } from 'viem'
import { sepolia } from 'viem/chains'
import { useConnection } from 'wagmi'
import { getEnsResolverQueryOptions } from 'wagmi/query'
import { CopyButton } from '@/components/CopyButton'
import { DataRow } from '@/components/DataRow'
import { EntityBadge } from '@/components/EntityBadge'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { Button } from '@/components/ui/button'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import {
  type GetEnsOwnerReturnType,
  getEnsOwnerQueryOptions,
} from '@/features/profile/hooks/useEnsOwner'
import { getV2NameHistoryQueryOptions } from '@/features/profile/hooks/useV2NameHistory'
import { getHasRolesQueryOptions } from '@/features/registry/hooks/useHasRoles'
import { getIsPermissionedResolverQueryOptions } from '@/features/resolver/hooks/useIsPermissionedResolver'
import { getSupportsInterfacesQueryOptions } from '@/hooks/useSupportsInterfaces'
import {
  RESOLVER_FEATURES,
  RESOLVER_INTERFACE_IDS,
  type ResolverInterfaceName,
} from '@/lib/constants/resolverInterfaceIds'
import { universalResolverAddress } from '@/lib/constants/universalResolver'
import { cn } from '@/lib/utils'
import { sepoliaWithEns, wagmiConfig } from '@/lib/wagmi'
import { extractErrorMessage } from '@/utils/errors/extractErrorMessage'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { transformV2EventsToSubgraphFormat } from '@/utils/history/transformV2Events'
import { NameSubgraphHistory } from '../../components/table/NameSubgraphHistory/NameSubgraphHistory'

export const Route = createFileRoute('/$name/resolver')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

const sepoliaUrl = sepolia.blockExplorers.default.url

const factoryAddress = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensVerifiableFactory',
})

const permissionedResolverImplAddress = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensPermissionedResolverImpl',
})

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
    <Button variant="secondary" className="flex items-center gap-2" asChild>
      <Link to="/$name/change-resolver" params={{ name }}>
        <EditIcon className="size-4" />
        Change resolver
      </Link>
    </Button>
  )
}

const ResolverSection = ({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) => {
  return (
    <section
      className={cn(
        'rounded-2xl border border-border bg-background',
        className,
      )}
    >
      {children}
    </section>
  )
}

const SummaryCard = ({
  icon,
  label,
  value,
  tooltip,
  valueHref,
}: {
  icon: ReactNode
  label: string
  value: ReactNode
  tooltip?: string
  valueHref?: string
}) => {
  const content = valueHref ? (
    <ExternalLink
      href={valueHref}
      className="underline decoration-dotted underline-offset-4"
    >
      {value}
    </ExternalLink>
  ) : (
    value
  )

  return (
    <ResolverSection className="flex min-h-23 items-center gap-6 p-6">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-base font-medium">
          <span>{label}</span>
          {tooltip ? (
            <InfoIcon className="size-4 text-muted-foreground" />
          ) : null}
        </div>
        <div className="min-w-0 truncate text-base">{content}</div>
      </div>
    </ResolverSection>
  )
}

const ResolverAddressValue = ({ address }: { address: Address }) => {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <ExternalLink
        href={`${sepoliaUrl}/address/${address}`}
        className="min-w-0"
      >
        <EntityBadge variant="contract" className="max-w-full truncate">
          {address}
        </EntityBadge>
      </ExternalLink>
      <CopyButton value={address} size="sm" />
    </div>
  )
}

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
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-base">
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

const ResolverDetailsCard = ({
  resolverAddress,
  children,
}: {
  resolverAddress: Address
  children: ReactNode
}) => {
  return (
    <ResolverSection className="p-6">
      <div className="flex flex-col gap-4">{children}</div>
      <div className="mt-4 border-t border-border pt-4">
        <DataRow label="Interfaces">
          <FeatureLinks resolverAddress={resolverAddress} />
        </DataRow>
      </div>
    </ResolverSection>
  )
}

const ResolverBanner = ({
  name,
  docsHref,
}: {
  name: 'Permissioned Resolver' | 'ENS Public Resolver'
  docsHref: string
}) => {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl bg-[#d1eedf] px-6 py-6 text-center text-[#033010]">
      <ShieldCheckIcon className="size-8" />
      <p className="text-base">
        This resolver is the official{' '}
        <ExternalLink
          href={docsHref}
          className="underline decoration-dotted underline-offset-4"
        >
          {name}
        </ExternalLink>
        . This resolver has been audited and is considered secure.
      </p>
    </div>
  )
}

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
          <Button variant="secondary" size="sm" asChild>
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
        <Button variant="secondary" size="sm" asChild>
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

const PermissionedResolverView = ({
  name,
  ownerData,
  resolverAddress,
}: {
  name: string
  ownerData: NonNullable<GetEnsOwnerReturnType>
  resolverAddress: Address
}) => {
  const ownerLabel = truncateAddress(ownerData.owner, 6, 4, '...')

  return (
    <>
      <ResolverBanner
        name="Permissioned Resolver"
        docsHref="https://github.com/ensdomains/contracts-v2/blob/main/contracts/src/resolver/PermissionedResolver.sol"
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SummaryCard
          icon={<NameAvatar name={name} height="24px" width="24px" />}
          label="Owner"
          value={ownerLabel}
        />
        <SummaryCard
          icon={<FocusIcon className="size-5" />}
          label="Type"
          value="Permissioned Resolver"
          valueHref="https://github.com/ensdomains/contracts-v2/blob/main/contracts/src/resolver/PermissionedResolver.sol"
        />
        <SummaryCard
          icon={<ShieldCheckIcon className="size-5 text-primary" />}
          label="Network"
          value="Sepolia"
          tooltip="Permissioned resolvers are deployed on ENSv2 infrastructure."
        />
      </div>
      <ResolverDetailsCard resolverAddress={resolverAddress}>
        <DataRow label="Protocol">
          <span className="text-base">ENSv2</span>
        </DataRow>
        <DataRow label="Chain ID">
          <div className="flex items-center gap-2">
            <span className="font-mono text-base">
              {String(sepoliaWithEns.id)}
            </span>
            <CopyButton value={String(sepoliaWithEns.id)} size="sm" />
          </div>
        </DataRow>
        <DataRow label="Contract">
          <ResolverAddressValue address={resolverAddress} />
        </DataRow>
        {permissionedResolverImplAddress ? (
          <DataRow label="Implementation">
            <ResolverAddressValue address={permissionedResolverImplAddress} />
          </DataRow>
        ) : null}
        {factoryAddress ? (
          <DataRow label="Factory">
            <ResolverAddressValue address={factoryAddress} />
          </DataRow>
        ) : null}
      </ResolverDetailsCard>
    </>
  )
}

const PublicResolverView = ({
  resolverAddress,
}: {
  resolverAddress: Address
}) => {
  return (
    <>
      <ResolverBanner
        name="ENS Public Resolver"
        docsHref="https://docs.ens.domains/resolvers/public/"
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SummaryCard
          icon={<GitBranchIcon className="size-5" />}
          label="Version"
          value="Latest"
        />
        <SummaryCard
          icon={<FocusIcon className="size-5" />}
          label="Type"
          value="Public Resolver"
          valueHref="https://docs.ens.domains/resolvers/public/"
        />
      </div>
      <ResolverDetailsCard resolverAddress={resolverAddress}>
        <DataRow label="Contract">
          <ResolverAddressValue address={resolverAddress} />
        </DataRow>
      </ResolverDetailsCard>
    </>
  )
}

const CustomResolverView = ({
  resolverAddress,
  protocolVersion,
}: {
  resolverAddress: Address
  protocolVersion: NonNullable<GetEnsOwnerReturnType>['protocolVersion']
}) => {
  return (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SummaryCard
          icon={<FocusIcon className="size-5" />}
          label="Type"
          value="Custom Resolver"
        />
        <SummaryCard
          icon={<GitBranchIcon className="size-5" />}
          label="Protocol"
          value={protocolVersion}
        />
      </div>
      <ResolverDetailsCard resolverAddress={resolverAddress}>
        <DataRow label="Contract">
          <ResolverAddressValue address={resolverAddress} />
        </DataRow>
        <DataRow label="Chain ID">
          <div className="flex items-center gap-2">
            <span className="font-mono text-base">
              {String(sepoliaWithEns.id)}
            </span>
            <CopyButton value={String(sepoliaWithEns.id)} size="sm" />
          </div>
        </DataRow>
      </ResolverDetailsCard>
    </>
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
          ownerData={ownerData}
          resolverAddress={resolverAddress}
        />
      ) : isOfficialPublicResolver ? (
        <PublicResolverView resolverAddress={resolverAddress} />
      ) : (
        <CustomResolverView
          resolverAddress={resolverAddress}
          protocolVersion={ownerData.protocolVersion}
        />
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

  if (!hasSetResolverRole) {
    return null
  }

  return (
    <Button variant="secondary" className="flex items-center gap-2" asChild>
      <Link to="/$name/change-resolver" params={{ name }}>
        <EditIcon className="size-4" />
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
      <div className="flex items-center gap-4 rounded-2xl bg-blue-50 p-6">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-100">
          <InfoIcon className="size-5 text-lapis-500" />
        </div>
        <p className="flex-1 text-base text-lapis-900">
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

  if (ownerQuery.isLoading) return <LoadingMessage title="Loading owner data" />
  if (resolverQuery.isLoading)
    return <LoadingMessage title="Loading resolver address" />

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
