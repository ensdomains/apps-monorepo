import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { GitBranch, ShieldIcon } from 'lucide-react'
import type { Address, Hash } from 'viem'
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
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { PageHeading } from '@/components/PageHeading'
import {
  countRecentEvents,
  formatRecentEventCount,
} from '@/features/history/countRecentEvents'
import { InfoRow } from '@/features/profile/components/InfoRow'
import { getRegistryHistoryQueryOptions } from '@/features/registry/components/v2/RegistryHistory'
import { describeRegistryContract } from '@/features/registry/describeRegistryContract'
import { getNameRegistriesQueryOptions } from '@/features/registry/hooks/useNameRegistryDiscovery'
import {
  getRegistryInfoQueryOptions,
  type RegistryInfo,
} from '@/features/registry/hooks/useRegistry'
import { getRegistryRootRoleHoldersQueryOptions } from '@/features/roles/hooks/useRegistryRootRoleHolders'
import { ensChain } from '@/lib/wagmi'
import { useBlockExplorerTxUrl } from '@/utils/blockExplorer/useBlockExplorerUrl'
import { formatTimestampDate } from '@/utils/formatting/formatTimestamp'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

export const Route = createFileRoute('/registry/$address/')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

const FACTORY_ADDRESS = getChainContractAddress({
  chain: ensChain,
  contract: 'ensVerifiableFactory',
})

function RouteComponent() {
  const { address: addressParam } = Route.useParams()
  const address = addressParam as Address

  const {
    data: registry,
    isLoading,
    error,
  } = useQuery(getRegistryInfoQueryOptions({ address }))
  const { data: ethRegistries, isPending: isRootPending } = useQuery(
    getNameRegistriesQueryOptions({ name: 'eth' }),
  )
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

  const { type, docsHref } = describeRegistryContract({
    address,
    rootAddress: ethRegistries?.at(-1) ?? null,
  })
  const deployedDate = registry.createdAt
    ? formatTimestampDate(registry.createdAt)
    : null

  return (
    <div className="flex flex-col gap-8">
      <PageHeading className="font-serif">Registry contract</PageHeading>

      <div className="flex flex-col">
        <InfoRow label="Type">
          <ContractTypeValue isVerified>
            {isRootPending ? <span className="text-neutral-4">…</span> : type}
          </ContractTypeValue>
        </InfoRow>
        <InfoRow label="Docs">
          <ContractDocsValue href={docsHref} />
        </InfoRow>
        <InfoRow label="Address">
          <ContractAddressValue address={address} />
        </InfoRow>
        <InfoRow label="Factory">
          <EntityBadge
            variant="contract"
            label="registry factory"
            address={FACTORY_ADDRESS}
            className="font-normal"
          >
            {truncateAddress(FACTORY_ADDRESS, 6, 4)}
          </EntityBadge>
        </InfoRow>
        <InfoRow label="Deployed">
          <DeployedBadge
            transactionHash={registry.createdTransactionHash}
            deployedDate={deployedDate}
          />
        </InfoRow>
        <InfoRow
          label="Used by"
          className="sm:h-auto sm:min-h-10 sm:items-start sm:[&>div:first-child]:h-10"
        >
          <UsedByValue registry={registry} />
        </InfoRow>
      </div>

      <ContractCounterCards>
        <ContractCounterCard
          to="/registry/$address/labels"
          params={{ address }}
        >
          <ContractCounterCardContent
            icon={GitBranch}
            label="Labels"
            value={registry.labelCount ?? '—'}
          />
        </ContractCounterCard>
        <ContractCounterCard to="/registry/$address/roles" params={{ address }}>
          <ContractCounterCardContent
            icon={ShieldIcon}
            label="Role holders"
            value={<RoleHolderCount address={address} />}
          />
        </ContractCounterCard>
        <ContractCounterCard
          to="/registry/$address/history"
          params={{ address }}
        >
          <ContractCounterCardContent
            icon={HistoryIcon}
            label="Events in last 30 days"
            value={<RecentEventCount address={address} />}
          />
        </ContractCounterCard>
      </ContractCounterCards>
    </div>
  )
}

/** The names pointing at this registry, or how many when the list runs past one page. */
const UsedByValue = ({ registry }: { readonly registry: RegistryInfo }) => {
  const names = registry.referencedBy
    .map((domain) => domain.name)
    .filter((name): name is string => !!name)

  if (names.length === 0)
    return <span className="text-muted-foreground">—</span>
  if (registry.referencedByHasMore) {
    return (
      <span className="font-semi-mono text-base text-neutral-7">
        {names.length}+ names
      </span>
    )
  }

  return (
    <div className="flex flex-wrap gap-2 sm:py-2">
      {names.map((name) => (
        <EntityBadge key={name} variant="name" name={name} showAvatar compact>
          {name}
        </EntityBadge>
      ))}
    </div>
  )
}

/** Distinct accounts on the root resource, the rows the Roles page lists. */
const RoleHolderCount = ({ address }: { readonly address: Address }) => {
  const {
    data: holders,
    isLoading,
    error,
  } = useQuery(
    getRegistryRootRoleHoldersQueryOptions({ registryAddress: address }),
  )

  if (isLoading) return <span className="text-neutral-4">…</span>
  if (error || !holders) return <>—</>

  return <>{holders.length}</>
}

const RecentEventCount = ({ address }: { readonly address: Address }) => {
  const { data, isLoading, error } = useInfiniteQuery(
    getRegistryHistoryQueryOptions({ address }),
  )
  const page = data?.pages[0]

  if (isLoading) return <span className="text-neutral-4">…</span>
  if (error || !page) return <>—</>

  return (
    <>
      {formatRecentEventCount(
        countRecentEvents({
          timestamps: page.events.map((event) => event.timestamp),
          nowSeconds: Math.floor(Date.now() / 1000),
          hasMore: page.hasNextPage,
        }),
      )}
    </>
  )
}

const DeployedBadge = ({
  transactionHash,
  deployedDate,
}: {
  readonly transactionHash: Hash | null
  readonly deployedDate: string | null
}) => {
  const deploymentTxUrl = useBlockExplorerTxUrl(transactionHash ?? undefined)

  if (!transactionHash)
    return deployedDate ? <span>{deployedDate}</span> : <span>—</span>

  return (
    <EntityBadge
      variant="tx"
      className="font-normal"
      label={deployedDate ?? undefined}
      copyValue={transactionHash}
      etherscanHref={deploymentTxUrl}
    >
      {truncateAddress(transactionHash, 6, 4)}
    </EntityBadge>
  )
}
