import { useQuery } from '@tanstack/react-query'
import { getDnsSecEnabledQueryOptions } from '@/features/profile/hooks/useDnsSecEnabled'
import { DNSSEC_HELP_LINKS } from '../constants'
import { SupportLinkList } from './SupportLinkList'
import { RefreshButton, StatusChip } from './shared'

/**
 * The DNSSEC half of the setup step. Both import paths need DNSSEC on the
 * domain, and it is switched on in the same DNS manager as the ownership TXT
 * record — so it sits next to that record rather than behind its own step.
 *
 * The step reads the same query to gate its final action; React Query serves
 * both from one cache entry, so there is no second request.
 */
export const EnableDnssec = ({ name }: { readonly name: string }) => {
  // DNSSEC must be enabled on the domain itself (not just its TLD) — the
  // helper's DNS-over-HTTPS AD-flag check works for any name.
  const dnssecQuery = useQuery(getDnsSecEnabledQueryOptions({ tld: name }))
  const isEnabled = dnssecQuery.data === true

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-medium">1. Enable DNSSEC</h3>
        <p className="text-sm text-muted-foreground">
          Turn DNSSEC on for this domain at your DNS provider.
        </p>
      </div>
      <div className="flex items-center gap-3">
        {isEnabled ? (
          <StatusChip tone="success" className="flex-1">
            DNSSEC enabled
          </StatusChip>
        ) : dnssecQuery.isError ? (
          // A failed check is not "not enabled" — surface it as an error.
          <StatusChip tone="danger" className="flex-1">
            DNSSEC check failed — refresh to retry
          </StatusChip>
        ) : (
          <StatusChip tone="warning" className="flex-1">
            {dnssecQuery.isLoading ? 'Checking DNSSEC…' : 'DNSSEC not enabled'}
          </StatusChip>
        )}
        <RefreshButton
          onClick={() => void dnssecQuery.refetch()}
          isRefreshing={dnssecQuery.isRefetching}
        />
      </div>
      {!isEnabled && (
        <SupportLinkList
          title="Registrar guides for enabling DNSSEC:"
          items={DNSSEC_HELP_LINKS}
        />
      )}
    </div>
  )
}
