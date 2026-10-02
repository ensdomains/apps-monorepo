import { useQuery } from '@tanstack/react-query'
import { DnssecDebugLink } from '@/features/dnssec-debug/components/DnssecDebugLink'
import { getDnsSecEnabledQueryOptions } from '@/features/profile/hooks/useDnsSecEnabled'
import { DNSSEC_HELP_LINKS } from '../constants'
import { SupportLinkList } from './SupportLinkList'
import {
  RefreshButton,
  StatusChip,
  StepActions,
  StepHeadingCard,
  StepSuccessCard,
} from './shared'

export const EnableDnssec = ({
  name,
  onBack,
  onNext,
}: {
  readonly name: string
  readonly onBack: () => void
  readonly onNext: () => void
}) => {
  // DNSSEC must be enabled on the domain itself (not just its TLD) — the
  // helper's DNS-over-HTTPS AD-flag check works for any name.
  const dnssecQuery = useQuery(getDnsSecEnabledQueryOptions({ tld: name }))
  const isEnabled = dnssecQuery.data === true

  return (
    <div className="flex flex-col gap-4">
      {isEnabled ? (
        <StepSuccessCard
          title="DNSSEC enabled"
          description="DNSSEC is enabled on this domain."
        />
      ) : (
        <>
          <StepHeadingCard
            title="Enable DNSSEC"
            description="You'll need to visit your domain registrar to enable DNSSEC."
          />
          <div className="flex items-center gap-3">
            {/* A failed check is not "not enabled" — surface it as an error. */}
            {dnssecQuery.isError ? (
              <StatusChip tone="danger" className="flex-1">
                DNSSEC check failed — refresh to retry
              </StatusChip>
            ) : (
              <StatusChip tone="warning" className="flex-1">
                {dnssecQuery.isLoading
                  ? 'Checking DNSSEC…'
                  : 'DNSSEC not enabled'}
              </StatusChip>
            )}
            <RefreshButton
              onClick={() => void dnssecQuery.refetch()}
              isRefreshing={dnssecQuery.isRefetching}
            />
          </div>
          {!dnssecQuery.isLoading && (
            <DnssecDebugLink name={name} source="import" />
          )}
          <SupportLinkList
            title="Registrar guides for enabling DNSSEC:"
            items={DNSSEC_HELP_LINKS}
          />
        </>
      )}
      <StepActions
        onBack={onBack}
        primary={{ label: 'Next', onClick: onNext, disabled: !isEnabled }}
      />
    </div>
  )
}
