import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise, ok } from 'neverthrow'
import { asciiEncode } from '@/utils/token/ascii'
import { DNS_RESOLVERS, type DnsResolverId } from '../constants'
import type { DnssecReport } from '../types'
import { createDohQueryFn } from '../utils/dohQuery'
import { walkDnssecChain } from '../utils/walkChain'

export class DnssecLookupError extends TaggedError('DnssecLookupError')<{
  cause: unknown
}> {}

type GetDnssecReportParameters = {
  name: string
  resolver: DnsResolverId
}

/**
 * Walks and evaluates the DNSSEC chain for a DNS name over DNS-over-HTTPS.
 * Only transport failures (resolver unreachable, malformed response) error —
 * every DNSSEC problem is reported inside the result.
 */
export const getDnssecReport = ResultFn(async function* ({
  name,
  resolver,
}: GetDnssecReportParameters) {
  const report = yield* fromPromise(
    walkDnssecChain({
      // DNS speaks A-labels: an internationalized name is queried as punycode.
      name: asciiEncode(name),
      resolver,
      query: createDohQueryFn(DNS_RESOLVERS[resolver].url),
    }),
    (e) => new DnssecLookupError({ cause: e }),
  )
  return ok<DnssecReport>(report)
})

const getDnssecReportQueryKey = createQueryKey<
  'dnssec-report',
  GetDnssecReportParameters
>('dnssec-report')

export const getDnssecReportQueryOptions = (
  params: GetDnssecReportParameters,
) =>
  resultQueryOptions({
    queryKey: getDnssecReportQueryKey(params),
    queryFn: ({ queryKey: [, p] }) => getDnssecReport(p),
    // A snapshot of live DNS: always re-check on open, and don't retry —
    // DNSSEC failures are in the result, not thrown.
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
