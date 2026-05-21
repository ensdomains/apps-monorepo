import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ChevronRight, ShieldIcon, TagIcon } from 'lucide-react'
import type { Address } from 'viem'
import { useChainId } from 'wagmi'
import { EntityBadge } from '@/components/EntityBadge'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useParentRegistry,
  useRegistry,
  useRegistryReferencedBy,
} from '@/features/registry/hooks/useRegistry'
import { useSupportsInterfaces } from '@/hooks/useSupportsInterfaces'
import { REGISTRY_INTERFACE_IDS } from '@/lib/constants/registryInterfaceIds'
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

  const { data: registry, isLoading, error } = useRegistry(address)
  const { data: parent } = useParentRegistry(registry?.parentRegistry)
  const referencedBy = useRegistryReferencedBy(address)

  // Detect the registry type on-chain via ERC-165 (UserRegistry extends
  // PermissionedRegistry, so it reports this interface too).
  const { data: registryInterfaces } = useSupportsInterfaces({
    address,
    interfaces: Object.values(REGISTRY_INTERFACE_IDS),
  })
  const registryType =
    registryInterfaces === undefined
      ? null
      : registryInterfaces[0]
        ? 'PermissionedRegistry'
        : 'Registry'

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
            <strong>{truncateAddress(address, 6, 4, '...')}</strong> is not a
            known registry contract.
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
    <div className="flex flex-col gap-6 p-4 sm:p-6 w-full max-w-360 mx-auto">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl md:text-heading font-medium leading-none">
          Registry Contract
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground font-mono">
          <span className="flex items-center gap-1.5">
            type
            {registryType ? (
              <span className="rounded bg-muted px-1.5 py-0.5 text-foreground">
                {registryType}
              </span>
            ) : (
              <Skeleton className="h-5 w-32" />
            )}
          </span>
          <span>Chain ID: {chainId}</span>
          <span>Protocol: {PROTOCOL}</span>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <dl className="flex-1 grid grid-cols-[auto_1fr] items-center gap-x-8 gap-y-4 text-sm">
          <dt className="text-muted-foreground">Address</dt>
          <dd>
            <EntityBadge variant="contract" address={address} inline>
              {truncateAddress(address, 6, 4, '...')}
            </EntityBadge>
          </dd>

          <dt className="text-muted-foreground">Deployed</dt>
          <dd className="text-foreground">{deployedDate ?? '—'}</dd>

          <dt className="text-muted-foreground">Factory</dt>
          <dd>
            <EntityBadge
              variant="contract"
              label="registry factory"
              address={factoryAddress}
              className="font-normal"
              inline
            >
              {truncateAddress(factoryAddress, 6, 4, '...')}
            </EntityBadge>
          </dd>

          <dt className="text-muted-foreground">Parent</dt>
          <dd>
            {parent?.name ? (
              <EntityBadge variant="name" name={parent.name} showAvatar inline>
                {parent.name}
              </EntityBadge>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </dd>

          <dt className="text-muted-foreground">Referenced by</dt>
          <dd className="flex flex-wrap items-center gap-2">
            {referencedBy.data.length > 0 ? (
              referencedBy.data.map((ref) => (
                <EntityBadge
                  key={ref.name}
                  variant="name"
                  name={ref.name}
                  showAvatar
                  inline
                >
                  {ref.name}
                </EntityBadge>
              ))
            ) : (
              // STUB: pending an indexer `referencedBy` field — see useRegistry.
              <span className="text-muted-foreground">—</span>
            )}
          </dd>
        </dl>

        <div className="flex flex-col gap-3 w-full lg:w-72">
          <RegistryNavCard
            icon={<TagIcon className="size-4" />}
            label="Labels"
            count={registry.labelCount}
            to="/registry/$address/labels"
            address={address}
          />
          <RegistryNavCard
            icon={<ShieldIcon className="size-4" />}
            label="Roles"
            count={registry.roleCount}
            to="/registry/$address/roles"
            address={address}
          />
        </div>
      </div>
    </div>
  )
}

const RegistryNavCard = ({
  icon,
  label,
  count,
  to,
  address,
}: {
  icon: React.ReactNode
  label: string
  count: number
  to: '/registry/$address/labels' | '/registry/$address/roles'
  address: Address
}) => (
  <Link to={to} params={{ address }} className="no-underline">
    <Card className="flex-row items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-accent">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-sm text-foreground">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{count}</span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </div>
    </Card>
  </Link>
)
