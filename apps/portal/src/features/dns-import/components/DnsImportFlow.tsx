import { useQuery } from '@tanstack/react-query'
import { CircleAlert } from 'lucide-react'
import { match } from 'ts-pattern'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { MessageCard } from '@/components/ui/message-card'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getTLD, isClaimable } from '@/utils/ens/tldHelpers'
import { getDnsTldStatusQueryOptions } from '../queries/getDnsTldStatus'
import type { DnsImportStep, DnsImportType } from '../types'
import { CustomTldMessage } from './CustomTldMessage'
import { SelectImportType } from './SelectImportType'
import { VerifyOwnership } from './VerifyOwnership'

export type DnsImportSearch = {
  readonly type: DnsImportType
  readonly step: DnsImportStep
}

/**
 * The DNS import flow (WEB-126): select import type → set up the domain
 * (DNSSEC + the ownership TXT record, which are configured together at the DNS
 * provider) → import transaction for the onchain path. The step and type live
 * in the URL search params, so a reload resumes where the user left off —
 * every step's completion state is re-derived from live DNS/chain queries.
 */
export const DnsImportFlow = ({
  name,
  search,
  onSearchChange,
}: {
  readonly name: string
  readonly search: DnsImportSearch
  readonly onSearchChange: (patch: Partial<DnsImportSearch>) => void
}) => {
  const ownerQuery = useQuery(getEnsOwnerQueryOptions({ name }))
  const tldStatusQuery = useQuery({
    ...getDnsTldStatusQueryOptions({ tld: getTLD(name) }),
    enabled: isClaimable(name),
  })

  if (!isClaimable(name)) {
    return (
      <MessageCard
        variant="warning"
        icon={<CircleAlert className="size-6" strokeWidth={1.5} />}
        title="Not importable"
        description={
          <p>
            Only second-level DNS names (like{' '}
            <strong className="font-medium">example.com</strong>) can be
            imported to ENS.
          </p>
        }
      />
    )
  }

  if (ownerQuery.isLoading || tldStatusQuery.isLoading) {
    return <LoadingSpinner title="Checking name…" />
  }

  // TLDs whose operator claimed the TLD node run a custom ENS integration —
  // neither import path applies (see getDnsTldStatus).
  if (tldStatusQuery.data?.type === 'custom') {
    return <CustomTldMessage tld={getTLD(name)} />
  }

  if (ownerQuery.data) {
    return (
      <MessageCard
        icon={<CircleAlert className="size-6" strokeWidth={1.5} />}
        title="Already imported"
        description={
          <p>
            <strong className="font-medium">{name}</strong> has already been
            imported to ENS.
          </p>
        }
        actionButton={{ label: 'View name', href: `/${name}` }}
      />
    )
  }

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col gap-6 pt-6">
      <h1 className="font-serif text-4xl font-normal leading-none">{name}</h1>
      {match(search.step)
        .with('start', () => (
          <SelectImportType
            name={name}
            type={search.type}
            onTypeChange={(type) => onSearchChange({ type })}
            onBegin={() => onSearchChange({ step: 'setup' })}
          />
        ))
        .with('setup', () => (
          <VerifyOwnership
            name={name}
            type={search.type}
            onBack={() => onSearchChange({ step: 'start' })}
          />
        ))
        .exhaustive()}
    </div>
  )
}
