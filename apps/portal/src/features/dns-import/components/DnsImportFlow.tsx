import { useQuery } from '@tanstack/react-query'
import { CircleAlert } from 'lucide-react'
import { match } from 'ts-pattern'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { MessageCard } from '@/components/ui/message-card'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { isClaimable } from '@/utils/ens/tldHelpers'
import type { DnsImportStep, DnsImportType } from '../types'
import { EnableDnssec } from './EnableDnssec'
import { SelectImportType } from './SelectImportType'
import { VerifyOwnership } from './VerifyOwnership'

export type DnsImportSearch = {
  readonly type: DnsImportType
  readonly step: DnsImportStep
}

/**
 * The DNS import flow (WEB-126): select import type → enable DNSSEC → verify
 * ownership (→ import transaction for the onchain path). The step and type
 * live in the URL search params, so a reload resumes where the user left off —
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

  if (!isClaimable(name)) {
    return (
      <MessageCard
        variant="warning"
        icon={<CircleAlert className="size-6" strokeWidth={1.5} />}
        title="Not importable"
        description={
          <p>
            Only second-level DNS names (like <strong>example.com</strong>) can
            be imported to ENS.
          </p>
        }
      />
    )
  }

  if (ownerQuery.isLoading) {
    return <LoadingSpinner title="Checking name…" />
  }

  if (ownerQuery.data) {
    return (
      <MessageCard
        icon={<CircleAlert className="size-6" strokeWidth={1.5} />}
        title="Already imported"
        description={
          <p>
            <strong>{name}</strong> has already been imported to ENS.
          </p>
        }
        actionButton={{ label: 'View name', href: `/${name}` }}
      />
    )
  }

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col gap-6 pt-6">
      <h1 className="font-serif text-4xl font-medium leading-none">{name}</h1>
      {match(search.step)
        .with('start', () => (
          <SelectImportType
            type={search.type}
            onTypeChange={(type) => onSearchChange({ type })}
            onBegin={() => onSearchChange({ step: 'dnssec' })}
          />
        ))
        .with('dnssec', () => (
          <EnableDnssec
            name={name}
            onBack={() => onSearchChange({ step: 'start' })}
            onNext={() => onSearchChange({ step: 'verify' })}
          />
        ))
        .with('verify', () => (
          <VerifyOwnership
            name={name}
            type={search.type}
            onBack={() => onSearchChange({ step: 'dnssec' })}
          />
        ))
        .exhaustive()}
    </div>
  )
}
