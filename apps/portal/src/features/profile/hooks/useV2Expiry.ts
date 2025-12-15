import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  getExpiry as ensjs_getExpiry,
  type GetExpiryErrorType,
  type GetExpiryParameters,
} from '@ensdomains/ensjs/public/v2'
import { fromPromise, ok } from 'neverthrow'
import { namechainSepolia } from '@/lib/wagmi'
import { safeGetNamechainSepoliaClient } from '@/lib/wagmi/helpers'

export class GetExpiryError extends TaggedError('GetExpiryError')<{
  cause: GetExpiryErrorType
}> {}

export const getV2Expiry = ResultFn(async function* (
  params: GetExpiryParameters,
) {
  const client = yield* safeGetNamechainSepoliaClient()

  const expiry = yield* await fromPromise(
    ensjs_getExpiry({ ...client, chain: namechainSepolia }, params),
    (e) =>
      new GetExpiryError({
        cause: e as GetExpiryErrorType,
      }),
  )
  return ok(expiry)
})

export const getV2ExpiryQueryKey = createQueryKey<
  'get-v2-expiry',
  GetExpiryParameters
>('get-v2-expiry')

export const getV2ExpiryQueryOptions = (params: GetExpiryParameters) =>
  resultQueryOptions({
    queryKey: getV2ExpiryQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getV2Expiry(params),
  })
