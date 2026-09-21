import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  type GetDnsOwnerErrorType,
  type GetDnsOwnerReturnType,
  getDnsOwner,
} from '@ensdomains/ensjs/dns'
import { fromPromise, ok } from 'neverthrow'

export class GetDnsOwnerError extends TaggedError('GetDnsOwnerError')<{
  cause: GetDnsOwnerErrorType
}> {}

type GetDnsOwnerParameters = {
  name: string
  /**
   * strict=true throws the typed DNS errors (mapped to verify-step states);
   * strict=false returns null on any failure (used for sync detection where
   * "can't read the record" simply means "nothing to act on").
   */
  strict: boolean
}

/**
 * The address in the `_ens.<name>` TXT record — the DNS-side owner used by the
 * onchain import path and the sync-manager check. DNS-over-HTTPS lookup, no
 * chain client involved.
 */
export const getDnsOwnerResult = ResultFn(async function* ({
  name,
  strict,
}: GetDnsOwnerParameters) {
  const owner = yield* fromPromise(
    getDnsOwner({ name, strict }),
    (e) => new GetDnsOwnerError({ cause: e as GetDnsOwnerErrorType }),
  )
  return ok<GetDnsOwnerReturnType>(owner)
})

const getDnsOwnerQueryKey = createQueryKey<'dns-owner', GetDnsOwnerParameters>(
  'dns-owner',
)

export const getDnsOwnerQueryOptions = (params: GetDnsOwnerParameters) =>
  resultQueryOptions({
    queryKey: getDnsOwnerQueryKey(params),
    queryFn: ({ queryKey: [, p] }) => getDnsOwnerResult(p),
    // The expected failure modes (no record yet, invalid record) are stable
    // until the user edits their DNS zone — retrying only delays the state.
    retry: false,
    staleTime: 0,
  })
