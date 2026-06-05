import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ChevronRight,
  GitBranch,
  ShieldIcon,
  TriangleAlert,
} from 'lucide-react'
import { match, P } from 'ts-pattern'
import { type Address, isAddressEqual, zeroAddress } from 'viem'
import { useChainId, useEnsName } from 'wagmi'
import { EntityBadge } from '@/components/EntityBadge'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { SoonBadge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { RegistryHistoryByAddress } from '@/features/registry/components/v2/RegistryHistory'
import {
  getRegistryQueryOptions,
  useRegistryReferencedBy,
} from '@/features/registry/hooks/useRegistry'
import { sepoliaWithEns } from '@/lib/wagmi'
import { formatTimestampDate } from '@/utils/formatting/formatTimestamp'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

export const Route = createFileRoute('/registry/$address/')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

const PROTOCOL = 'ENSv2'

function RouteComponent() {
  const { address: addressParam } = Route.useParams()
  const address = addressParam as Address
  const chainId = useChainId()

  const {
    data: registry,
    isLoading,
    error,
  } = useQuery(getRegistryQueryOptions({ address }))
  const {
    data: parent,
    isLoading: isLoadingParent,
    error: parentError,
  } = useQuery({
    ...getRegistryQueryOptions({
      address: registry?.parentRegistry ?? zeroAddress,
    }),
    enabled:
      !!registry?.parentRegistry &&
      !isAddressEqual(registry.parentRegistry, zeroAddress),
  })
  const {
    data: referencedBy,
    isLoading: isLoadingReferencedBy,
    error: referencedByError,
  } = useRegistryReferencedBy(registry ?? undefined)

  // Owner of this registry's ENS name — used for the Deployed badge so it
  // matches the Created badge on /$name/registry exactly.
  const {
    data: ownerData,
    isLoading: isOwnerLoading,
    error: ownerError,
  } = useQuery({
    ...getEnsOwnerQueryOptions({ name: registry?.name }),
    enabled: !!registry?.name,
  })
  const { data: ownerEnsName } = useEnsName({ address: ownerData?.owner })

  if (isLoading) return <LoadingSpinner title="Loading registry" />
  if (error)
    return (
      <ErrorMessage
        title="Error loading registry"
        description={error.message}
      />
    )
  if (!registry)
    return (
      <NotFoundMessage
        title="Registry not found"
        description={
          <>
            <strong>{truncateAddress(address, 6, 4)}</strong> is not a known
            registry contract.
          </>
        }
      />
    )

  const factoryAddress = getChainContractAddress({
    chain: sepoliaWithEns,
    contract: 'ensVerifiableFactory',
  })

  const deployedDate = registry.createdAt
    ? formatTimestampDate(registry.createdAt)
    : null

  return (
    <div className="flex flex-col gap-8 p-4 sm:p-10 w-full max-w-360 mx-auto">
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl md:text-heading font-normal leading-none">
          Registry Contract
        </h1>
        <div className="flex flex-col lg:flex-row flex-wrap gap-4 text-sm text-muted-foreground font-mono">
          <EntityBadge variant="default" label="type" className="font-normal">
            PermissionedRegistry
          </EntityBadge>
          <div className="flex flex-row flex-wrap gap-4 text-sm text-muted-foreground font-mono">
            <span>Chain ID: {chainId}</span>
            <span>Protocol: {PROTOCOL}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-10 lg:gap-6 lg:flex-row lg:items-start">
        <dl className="flex-1 grid lg:grid-cols-[auto_1fr] items-center gap-x-8 text-sm">
          <dt className="text-muted-foreground">Address</dt>
          <dd>
            <EntityBadge variant="contract" address={address}>
              {truncateAddress(address, 6, 4)}
            </EntityBadge>
          </dd>

          <dt className="text-muted-foreground">Deployed</dt>
          <dd>
            {match({
              hasName: !!registry.name,
              isOwnerLoading,
              ownerError,
              deployedDate,
            })
              .with({ hasName: false }, (m) =>
                m.deployedDate ? <span>{m.deployedDate}</span> : <span>—</span>,
              )
              .with({ isOwnerLoading: true }, () => (
                <Skeleton className="h-5 w-32" />
              ))
              .with({ ownerError: P.not(null) }, () => <FailedToLoad />)
              .otherwise(() =>
                deployedDate && ownerData?.owner ? (
                  <EntityBadge
                    variant={ownerEnsName ? 'name' : 'address'}
                    className="font-normal"
                    label={deployedDate}
                    name={ownerEnsName ?? undefined}
                    address={ownerData.owner}
                  >
                    {ownerEnsName ?? truncateAddress(ownerData.owner, 6, 4)}
                  </EntityBadge>
                ) : (
                  <span>—</span>
                ),
              )}
          </dd>

          <dt className="text-muted-foreground">Factory</dt>
          <dd>
            <EntityBadge
              variant="contract"
              label="registry factory"
              address={factoryAddress}
              className="font-normal"
            >
              {truncateAddress(factoryAddress, 6, 4)}
            </EntityBadge>
          </dd>

          <dt className="text-muted-foreground">Parent</dt>
          <dd>
            {match({
              isRoot: isAddressEqual(registry.parentRegistry, zeroAddress),
              isLoadingParent,
              parentError,
              parent,
            })
              .with({ isRoot: true }, () => (
                <span className="text-muted-foreground">—</span>
              ))
              .with({ isLoadingParent: true }, () => (
                <Skeleton className="h-5 w-32" />
              ))
              .with({ parentError: P.not(null) }, () => <FailedToLoad />)
              .with({ parent: { name: P.string.minLength(1) } }, (m) => (
                <EntityBadge variant="name" name={m.parent.name} showAvatar>
                  {m.parent.name}
                </EntityBadge>
              ))
              .otherwise(() => (
                <span className="text-muted-foreground">—</span>
              ))}
          </dd>

          <dt className="text-muted-foreground">Referenced by</dt>
          <dd className="flex flex-wrap items-center gap-2">
            {match({ isLoadingReferencedBy, referencedByError })
              .with({ isLoadingReferencedBy: true }, () => (
                <Skeleton className="h-5 w-32" />
              ))
              .with({ referencedByError: P.not(null) }, () => <FailedToLoad />)
              .otherwise(() =>
                referencedBy && referencedBy.length > 0 ? (
                  referencedBy.map((ref) => (
                    <EntityBadge
                      key={`${ref.emitter}-${ref.name}`}
                      variant="name"
                      name={ref.name}
                      showAvatar
                    >
                      {ref.name}
                    </EntityBadge>
                  ))
                ) : (
                  <span className="text-muted-foreground">—</span>
                ),
              )}
          </dd>
        </dl>

        <div className="flex flex-col gap-3 w-full lg:w-72">
          <RegistryNavCard
            icon={<GitBranch className="size-4" />}
            label="Labels"
            count={registry.labelCount}
            to="/registry/$address/labels"
            address={address}
            upcoming
          />
          <RegistryNavCard
            icon={<ShieldIcon className="size-4" />}
            label="Roles"
            count={registry.roleCount}
            to="/registry/$address/roles"
            address={address}
            upcoming
          />
        </div>
      </div>

      <RegistryHistoryByAddress address={address} name={registry.name} />
    </div>
  )
}

const RegistryNavCard = ({
  icon,
  label,
  count,
  to,
  address,
  upcoming = false,
}: {
  icon: React.ReactNode
  label: string
  count: number
  to: '/registry/$address/labels' | '/registry/$address/roles'
  address: Address
  upcoming?: boolean
}) => {
  const body = (
    <div className="flex flex-row w-full items-center justify-between gap-4 p-4 transition-colors rounded-sm group-hover/nav:bg-accent">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-sm font-normal text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-lg font-normal font-semi-mono">{count}</span>
        {upcoming ? (
          <SoonBadge />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground" />
        )}
      </div>
    </div>
  )

  if (upcoming) {
    return (
      <div
        aria-disabled
        className="flex border border-muted rounded-sm w-full opacity-50 cursor-not-allowed"
      >
        {body}
      </div>
    )
  }

  return (
    <Link
      to={to}
      params={{ address }}
      className="group/nav no-underline flex border border-muted rounded-sm w-full"
    >
      {body}
    </Link>
  )
}

const FailedToLoad = () => (
  <span className="inline-flex items-center gap-1 text-destructive">
    <TriangleAlert className="size-3.5" />
    Failed to load
  </span>
)
