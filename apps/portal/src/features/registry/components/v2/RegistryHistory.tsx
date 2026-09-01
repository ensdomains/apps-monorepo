import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ClockIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { type Address, zeroAddress } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { Button } from '@/components/ui/button'
import { HistoryTimelineView } from '@/features/history/components/HistoryTimeline'
import { extractErrorMessage } from '@/utils/errors/extractErrorMessage'
import { getNameRegistriesQueryOptions } from '../../hooks/useNameRegistryDiscovery'
import { getRegistryHistoryTimelineQueryOptions } from '../../hooks/useRegistryHistoryTimeline'

/**
 * History timeline for a registry contract, given its address.
 *
 * Keyed on the contract rather than a name so it shows everything the registry
 * emitted about its labels (subname registrations, subregistry links, role
 * grants) — the name-keyed timeline would only return the slice the indexer
 * attributes to the registry's own name.
 */
export const RegistryHistoryByAddress = ({
  address,
  heading,
  action,
  showFilters,
}: {
  address: Address
  /** Left side of the header bar; defaults to the page-level "History" title. */
  heading?: ReactNode
  /** Rendered after the filter chips, e.g. a "Full history" link. */
  action?: ReactNode
  /** Show the date / event-type chips and the truncation note. */
  showFilters?: boolean
}) => {
  const { data, isLoading, error } = useQuery(
    getRegistryHistoryTimelineQueryOptions({ address }),
  )

  if (isLoading) return <LoadingMessage />
  if (error) {
    return (
      <ErrorMessage
        title="Error loading registry history"
        description={extractErrorMessage(error, '')}
      />
    )
  }

  return (
    <HistoryTimelineView
      events={data?.events ?? []}
      hasMore={data?.hasMore}
      includeSubjectName
      heading={heading}
      action={action}
      showFilters={showFilters}
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

  // An embedded section, so it hides the filter chips and truncation note and
  // discloses through the "Full history" link instead — the same shape the
  // resolver page and the registry overview use.
  return (
    <RegistryHistoryByAddress
      address={address}
      showFilters={false}
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
