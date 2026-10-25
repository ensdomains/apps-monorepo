import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { GridIcon, UserRoundCog } from 'lucide-react'
import { match } from 'ts-pattern'
import { type Address, isAddressEqual } from 'viem'
import { HistoryIcon } from '@/assets/icons'
import {
  ContractAddressValue,
  ContractCounterCard,
  ContractCounterCardContent,
  ContractCounterCards,
  ContractDocsValue,
  ContractTypeValue,
} from '@/components/ContractOverview'
import { EntityBadge } from '@/components/EntityBadge'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { PageHeading } from '@/components/PageHeading'
import {
  countRecentEvents,
  formatRecentEventCount,
} from '@/features/history/countRecentEvents'
import { InfoRow } from '@/features/profile/components/InfoRow'
import { useIsPermissionedResolver } from '@/features/resolver/hooks/useIsPermissionedResolver'
import {
  getResolverOverviewQueryOptions,
  type ResolverOverview,
  resolverCollectionCount,
} from '@/features/resolver/hooks/useResolverOverview'
import { useSupportsInterfaces } from '@/hooks/useSupportsInterfaces'
import { CONTRACT_DOCS } from '@/lib/constants/contractDocs'
import {
  RESOLVER_FEATURES,
  RESOLVER_INTERFACE_IDS,
  type ResolverInterfaceName,
} from '@/lib/constants/resolverInterfaceIds'
import { officialPublicResolverAddress } from '@/lib/constants/universalResolver'
import { ensChain } from '@/lib/wagmi'
import { extractErrorMessage } from '@/utils/errors/extractErrorMessage'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { queryClient } from '@/utils/queryClient'

export const Route = createFileRoute('/resolver/$address/')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
  // Started, not awaited: a slow bigname read must not hold the page blank.
  loader: ({ params }) => {
    void queryClient.prefetchQuery(
      getResolverOverviewQueryOptions({ address: params.address }),
    )
  },
})

const FACTORY_ADDRESS = getChainContractAddress({
  chain: ensChain,
  contract: 'ensVerifiableFactory',
})

function RouteComponent() {
  const { address: addressParam } = Route.useParams()
  const address = addressParam as Address

  const {
    data: resolver,
    isLoading,
    error,
  } = useQuery(getResolverOverviewQueryOptions({ address }))
  const { data: isPermissionedResolver } = useIsPermissionedResolver({
    resolverAddress: address,
  })

  if (isLoading) return <LoadingMessage />

  if (error)
    return (
      <ErrorMessage
        title="Resolver unavailable"
        description={extractErrorMessage(error, '')}
      />
    )

  const isPublicResolver = isAddressEqual(
    address,
    officialPublicResolverAddress,
  )
  const usedBy = resolverCollectionCount(
    resolver?.nodeCount ?? null,
    resolver?.nodeCountIsLowerBound ? 'partial' : 'full',
  )

  return (
    <div className="flex flex-col gap-8">
      <PageHeading className="font-serif">Resolver contract</PageHeading>

      <div className="flex flex-col">
        <InfoRow label="Type">
          <ContractTypeValue
            isVerified={!!isPermissionedResolver || isPublicResolver}
          >
            {match({ isPermissionedResolver, isPublicResolver })
              .with(
                { isPermissionedResolver: true },
                () => 'Verified ENS V2 owned resolver',
              )
              .with(
                { isPublicResolver: true },
                () => 'Official ENS public resolver',
              )
              .otherwise(() => 'Custom resolver')}
          </ContractTypeValue>
        </InfoRow>
        <InfoRow label="Docs">
          <ContractDocsValue href={CONTRACT_DOCS.resolver} />
        </InfoRow>
        <InfoRow label="Address">
          <ContractAddressValue address={address} />
        </InfoRow>
        {isPermissionedResolver ? (
          <InfoRow label="Factory">
            <EntityBadge
              variant="contract"
              label="resolver factory"
              address={FACTORY_ADDRESS}
              className="font-normal"
            >
              {truncateAddress(FACTORY_ADDRESS, 6, 4)}
            </EntityBadge>
          </InfoRow>
        ) : null}
        <InfoRow
          label="Interfaces"
          className="sm:h-auto sm:min-h-10 sm:items-start sm:[&>div:first-child]:h-10"
        >
          <InterfaceBadges resolverAddress={address} />
        </InfoRow>
      </div>

      {resolver?.mirrorRegistry && (
        <p className="text-p text-muted-foreground">
          This resolver mirrors the ENSv1 registry at{' '}
          {truncateAddress(resolver.mirrorRegistry)}. The ENSv1 names it answers
          for are counted under the resolvers set for them there, not here.
        </p>
      )}

      <ContractCounterCards>
        <ContractCounterCard to="/resolver/$address/nodes" params={{ address }}>
          <ContractCounterCardContent
            icon={GridIcon}
            label="Used by"
            value={usedBy === 'Unknown' ? usedBy : `${usedBy} names`}
          />
        </ContractCounterCard>
        <ContractCounterCard to="/resolver/$address/roles" params={{ address }}>
          <ContractCounterCardContent
            icon={UserRoundCog}
            label="Role holders"
            value={resolverCollectionCount(
              resolver?.roleHolderCount ?? null,
              resolver?.rolesStatus ?? 'full',
            )}
          />
        </ContractCounterCard>
        <ContractCounterCard
          to="/resolver/$address/history"
          params={{ address }}
        >
          <ContractCounterCardContent
            icon={HistoryIcon}
            label="Events in last 30 days"
            value={formatRecentEventCount(recentEventsOf(resolver))}
          />
        </ContractCounterCard>
      </ContractCounterCards>
    </div>
  )
}

const recentEventsOf = (resolver: ResolverOverview | null | undefined) =>
  resolver?.events
    ? countRecentEvents({
        timestamps: resolver.events.flatMap((event) =>
          event.timestamp === null ? [] : [event.timestamp],
        ),
        nowSeconds: Math.floor(Date.now() / 1000),
        hasMore: resolver.eventsHasMore,
      })
    : null

const InterfaceBadges = ({
  resolverAddress,
}: {
  readonly resolverAddress: Address
}) => {
  const { data: supportsInterfaces, isLoading } = useSupportsInterfaces({
    address: resolverAddress,
    interfaces: Object.values(RESOLVER_INTERFACE_IDS),
  })

  if (isLoading) return <span className="text-neutral-4">…</span>
  if (!supportsInterfaces)
    return <span className="text-muted-foreground">—</span>

  const names = Object.keys(RESOLVER_INTERFACE_IDS)
    .filter((_, index) => supportsInterfaces[index])
    .map((name) => RESOLVER_FEATURES[name as ResolverInterfaceName]?.name)
    .filter((name): name is string => !!name)

  return (
    <div className="flex flex-wrap gap-2 sm:py-2">
      {names.map((name) => (
        <EntityBadge key={name} variant="default" className="font-normal">
          {name}
        </EntityBadge>
      ))}
    </div>
  )
}
