import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  type GetDnsImportDataErrorType,
  type GetDnsImportDataReturnType,
  getDnsImportData,
} from '@ensdomains/ensjs/dns'
import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'

export class GetDnsImportDataError extends TaggedError(
  'GetDnsImportDataError',
)<{
  cause: GetDnsImportDataErrorType
}> {}

type GetDnsImportDataParameters = {
  name: string
}

/**
 * Fetches the DNSSEC proof chain for `_ens.<name>` (via dnsprovejs) and
 * pre-verifies it against the onchain DNSSEC oracle. The result is the
 * `dnsImportData` consumed by `proveAndClaim`/`proveAndClaimWithResolver`.
 *
 * Note: throws ensjs's `DnsNewerRecordTypeAvailableError` when the onchain
 * inception is already newer than the DNS-side proof — for the sync-manager
 * flow that means "already up to date", not a failure.
 */
export const getDnsImportDataResult = ResultFn(async function* ({
  name,
}: GetDnsImportDataParameters) {
  const client = yield* safeGetClient()
  const data = yield* fromPromise(
    getDnsImportData(client, { name }),
    (e) => new GetDnsImportDataError({ cause: e as GetDnsImportDataErrorType }),
  )
  return ok<GetDnsImportDataReturnType>(data)
})

const getDnsImportDataQueryKey = createQueryKey<
  'dns-import-data',
  GetDnsImportDataParameters
>('dns-import-data')

export const getDnsImportDataQueryOptions = (
  params: GetDnsImportDataParameters,
) =>
  resultQueryOptions({
    queryKey: getDnsImportDataQueryKey(params),
    queryFn: ({ queryKey: [, p] }) => getDnsImportDataResult(p),
    // A proof is a snapshot of live DNS state — never serve a stale one to a
    // transaction, and don't retry: failures are deterministic until DNS changes.
    retry: false,
    staleTime: 0,
    gcTime: 0,
  })
