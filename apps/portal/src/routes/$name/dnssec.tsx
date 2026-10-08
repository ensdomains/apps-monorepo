import { createFileRoute } from '@tanstack/react-router'
import { InvalidNameMessage } from '@/components/InvalidNameMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { DnssecDebugger } from '@/features/dnssec-debug/components/DnssecDebugger'
import {
  DEFAULT_DNS_RESOLVER,
  DNS_RESOLVERS,
  type DnsResolverId,
} from '@/features/dnssec-debug/constants'
import type { DnssecDebugSource } from '@/features/dnssec-debug/hooks/useTrackDnssecDebug'
import { isClaimable } from '@/utils/ens/tldHelpers'

type DnssecSearch = {
  resolver?: DnsResolverId
  from?: DnssecDebugSource
}

const SOURCES: readonly DnssecDebugSource[] = ['sidebar', 'import', 'sync']

export const Route = createFileRoute('/$name/dnssec')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
  validateSearch: (search: Record<string, unknown>): DnssecSearch => ({
    resolver:
      typeof search.resolver === 'string' && search.resolver in DNS_RESOLVERS
        ? (search.resolver as DnsResolverId)
        : undefined,
    from: SOURCES.find((source) => source === search.from),
  }),
})

function RouteComponent() {
  const { name } = Route.useParams()
  const { resolver = DEFAULT_DNS_RESOLVER, from = 'direct' } = Route.useSearch()
  const navigate = Route.useNavigate()

  // DNS import (and so DNSSEC) only applies to second-level DNS names.
  if (!isClaimable(name)) {
    return (
      <InvalidNameMessage
        title="DNSSEC applies to DNS names"
        description={
          <>
            <strong>{name}</strong> is not a DNS second-level name, so there is
            no DNSSEC chain to inspect.
          </>
        }
      />
    )
  }

  return (
    <DnssecDebugger
      name={name}
      resolver={resolver}
      source={from}
      onResolverChange={(next) =>
        void navigate({
          search: (prev) => ({
            ...prev,
            resolver: next === DEFAULT_DNS_RESOLVER ? undefined : next,
          }),
          replace: true,
        })
      }
    />
  )
}
