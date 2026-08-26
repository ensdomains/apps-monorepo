import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { type Address, zeroAddress } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { HistoryTimelineView } from '@/features/history/components/HistoryTimeline'
import { getNameRegistriesQueryOptions } from '../../hooks/useNameRegistryDiscovery'
import { getRegistryHistoryTimelineQueryOptions } from '../../hooks/useRegistryEvents'

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
}: {
  address: Address
  /** Left side of the header bar; defaults to the page-level "History" title. */
  heading?: ReactNode
  /** Rendered after the filter chips, e.g. a "Full history" link. */
  action?: ReactNode
}) => {
  const { data, isLoading, error } = useQuery(
    getRegistryHistoryTimelineQueryOptions({ address }),
  )

  if (isLoading) return <LoadingMessage />
  if (error) {
    return (
      <ErrorMessage
        compact
        description="Error fetching registry history. Please refresh the page."
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
        compact
        description="Error fetching registry history. Please refresh the page."
      />
    )
  }

  if (!hasRegistry) return null

  return (
    <RegistryHistoryByAddress
      address={address}
      heading={
        <h2 className="text-caps leading-none text-foreground">History</h2>
      }
    />
  )
}
