import { resultInfiniteQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ClockIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { type Address, zeroAddress } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { Button } from '@/components/ui/button'
import { HistoryTimelineView } from '@/features/history/components/HistoryTimeline'
import { useTimelinePagesModel } from '@/features/history/hooks/useHistoryTimeline'
import {
  fetchTimelineEventPage,
  HISTORY_TIMELINE_PAGE_SIZE,
  timelinePageParams,
} from '@/features/history/timelineEventPage'
import { extractErrorMessage } from '@/utils/errors/extractErrorMessage'
import { getNameRegistriesQueryOptions } from '../../hooks/useNameRegistryDiscovery'

const registryHistoryTimelineQueryKey = createQueryKey<
  'get-registry-history-timeline',
  { readonly address: Address }
>('get-registry-history-timeline')

/**
 * History timeline for a registry contract, given its address.
 *
 * Keyed on the contract rather than a name so it shows everything the registry
 * emitted about its labels (subname registrations, subregistry links, role
 * grants) — the name-keyed timeline would only return the slice the indexer
 * attributes to the registry's own name.
 *
 * There is no v1 counterpart to merge in: registries are an ENSv2 contract, so a
 * v1 name has no registry for this to describe (see `V2RegistryInfo`).
 */
export const RegistryHistoryByAddress = ({
  address,
  heading,
  action,
}: {
  address: Address
  /** Left side of the header bar; defaults to the page-level "History" title. */
  heading?: ReactNode
  /** Rendered after the filter chips, e.g. a "Full history" link. */
  action?: ReactNode
}) => {
  // The top-level connection filtered on `contractAddress`, not
  // `registry(address:) { eventConnection }`: same feed (verified — identical
  // totalCount and first 200 ids), but the nested field drops variable arguments,
  // so `first` fell back to the default and `after` was ignored.
  const model = useTimelinePagesModel(
    resultInfiniteQueryOptions({
      queryKey: registryHistoryTimelineQueryKey({ address }),
      queryFn: ({ queryKey: [, { address }], pageParam }) =>
        fetchTimelineEventPage({
          where: { contractAddress: address.toLowerCase() },
          first: HISTORY_TIMELINE_PAGE_SIZE,
          after: pageParam,
        }),
      ...timelinePageParams,
    }),
  )

  if (model.isLoading) return <LoadingMessage />
  if (model.error) {
    return (
      <ErrorMessage
        title="Error loading registry history"
        description={extractErrorMessage(model.error, '')}
      />
    )
  }

  return (
    <HistoryTimelineView
      model={model}
      breakContent="load-more"
      heading={heading}
      action={action}
      // The registry is the subject, not the actor, so each row says who did it.
      showActor
      emptyTitle="No history yet"
      emptyDescription="Events for this registry will appear here."
    />
  )
}

/**
 * History timeline for a name's own registry contract. Discovers the address
 * via `getNameRegistriesQueryOptions` (which returns registries ordered
 * `[name, ...ancestors, root]`, so the name's own registry is at index 0)
 * and delegates to `RegistryHistoryByAddress`.
 */
export const RegistryHistory = ({ name }: { name: string }) => {
  const {
    data: registries,
    isLoading: isLoadingRegistries,
    error: registriesError,
  } = useQuery(getNameRegistriesQueryOptions({ name }))
  const address = registries?.at(0) ?? null
  const hasRegistry = !!address && address !== zeroAddress

  if (isLoadingRegistries) return <LoadingMessage />

  if (registriesError) {
    return (
      <ErrorMessage
        title="Error loading registry history"
        description={registriesError.cause?.message}
      />
    )
  }

  if (!hasRegistry) return null

  // An embedded section, so it discloses through the "Full history" link — the
  // same shape the resolver page and the registry overview use.
  return (
    <RegistryHistoryByAddress
      address={address}
      heading={<h2 className="text-caps text-foreground">History</h2>}
      action={
        <Button variant="outline" size="xs" asChild>
          <Link to="/registry/$address/history" params={{ address }}>
            <ClockIcon className="size-4" />
            Full history
          </Link>
        </Button>
      }
    />
  )
}
