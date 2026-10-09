import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { PageHeading } from '@/components/PageHeading'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { extractErrorMessage } from '@/utils/errors/extractErrorMessage'
import { DNS_RESOLVERS, type DnsResolverId } from '../constants'
import {
  type DnssecDebugSource,
  useTrackDnssecDebugOpened,
} from '../hooks/useTrackDnssecDebug'
import { getDnssecReportQueryOptions } from '../queries/getDnssecReport'
import { formatUtc } from '../utils/time'
import { DnssecGlossary } from './DnssecGlossary'
import { DnssecResults } from './DnssecResults'

const RESOLVER_IDS = Object.keys(DNS_RESOLVERS) as DnsResolverId[]

const isResolverId = (value: string): value is DnsResolverId =>
  value in DNS_RESOLVERS

type ToolbarProps = {
  readonly resolver: DnsResolverId
  readonly onResolverChange: (resolver: DnsResolverId) => void
  readonly onRerun: () => void
  readonly isFetching: boolean
  readonly checkedAt: number | undefined
}

const Toolbar = ({
  resolver,
  onResolverChange,
  onRerun,
  isFetching,
  checkedAt,
}: ToolbarProps) => (
  <div className="flex flex-wrap items-center gap-3">
    <span className="text-base text-muted-foreground">Resolver</span>
    <Tabs
      value={resolver}
      onValueChange={(value) => {
        if (isResolverId(value)) onResolverChange(value)
      }}
    >
      <TabsList>
        {RESOLVER_IDS.map((id) => (
          <TabsTrigger key={id} value={id}>
            {DNS_RESOLVERS[id].label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
    <Button variant="outline" size="sm" onClick={onRerun} disabled={isFetching}>
      <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} />
      Re-run
    </Button>
    {checkedAt !== undefined && (
      <span className="text-p text-muted-foreground">
        Checked {formatUtc(checkedAt)}. Resolvers may serve cached answers for
        up to their TTL.
      </span>
    )}
  </div>
)

type DnssecDebuggerProps = {
  readonly name: string
  readonly resolver: DnsResolverId
  readonly source: DnssecDebugSource
  readonly onResolverChange: (resolver: DnsResolverId) => void
}

export const DnssecDebugger = ({
  name,
  resolver,
  source,
  onResolverChange,
}: DnssecDebuggerProps) => {
  useTrackDnssecDebugOpened({ name, source })
  const reportQuery = useQuery(getDnssecReportQueryOptions({ name, resolver }))

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <PageHeading parent={{ type: 'name', name }}>DNSSEC</PageHeading>
        <p className="text-p text-muted-foreground">
          Every link in the chain of trust ENS relies on to verify {name}, from
          the DNS root down to its ENS records.
        </p>
      </header>

      <Toolbar
        resolver={resolver}
        onResolverChange={onResolverChange}
        onRerun={() => void reportQuery.refetch()}
        isFetching={reportQuery.isFetching}
        checkedAt={reportQuery.data?.checkedAt}
      />

      {reportQuery.isLoading && (
        <LoadingSpinner title="Walking the DNSSEC chain…" />
      )}
      {reportQuery.error?._tag === 'InvalidDnssecNameError' && (
        <ErrorMessage
          title={`${name} is not a valid ENS name`}
          description={`${extractErrorMessage(reportQuery.error.cause, 'The name could not be normalized.')} Only a name that normalizes can be imported into ENS.`}
        />
      )}
      {reportQuery.error?._tag === 'DnssecLookupError' && (
        <ErrorMessage
          title={`Could not reach ${DNS_RESOLVERS[resolver].label}`}
          description={`${extractErrorMessage(reportQuery.error, 'The DNS lookup failed.')} Check your connection, or try another resolver.`}
        />
      )}
      {reportQuery.data && (
        <DnssecResults name={name} report={reportQuery.data} />
      )}

      <DnssecGlossary />
    </div>
  )
}
