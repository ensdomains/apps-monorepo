import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  type IsDnsPublicSuffixErrorType,
  isDnsPublicSuffix,
} from '@ensdomains/ensjs/dns'
import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'

export class GetIsPublicSuffixError extends TaggedError(
  'GetIsPublicSuffixError',
)<{
  cause: IsDnsPublicSuffixErrorType
}> {}

type GetIsPublicSuffixParameters = {
  tld: string
}

/**
 * Whether the DNSRegistrar's onchain `PublicSuffixList` accepts this TLD —
 * the authoritative claimability gate. A TLD outside the list makes
 * `proveAndClaim` revert `InvalidPublicSuffix`, so the flow checks it before
 * admitting the user into the onchain path.
 */
export const getIsPublicSuffix = ResultFn(async function* ({
  tld,
}: GetIsPublicSuffixParameters) {
  const client = yield* safeGetClient()

  const isPublicSuffix = yield* fromPromise(
    isDnsPublicSuffix(client, { name: tld }),
    (e) =>
      new GetIsPublicSuffixError({ cause: e as IsDnsPublicSuffixErrorType }),
  )

  return ok(isPublicSuffix)
})

const getIsPublicSuffixQueryKey = createQueryKey<
  'dns-is-public-suffix',
  GetIsPublicSuffixParameters
>('dns-is-public-suffix')

export const getIsPublicSuffixQueryOptions = (
  params: GetIsPublicSuffixParameters,
) =>
  resultQueryOptions({
    queryKey: getIsPublicSuffixQueryKey(params),
    queryFn: ({ queryKey: [, p] }) => getIsPublicSuffix(p),
    staleTime: 1000 * 60 * 60,
  })
