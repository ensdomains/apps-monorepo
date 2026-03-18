import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  getExpiry as ensjs_getExpiry,
  type GetExpiryErrorType,
  type GetExpiryParameters,
} from '@ensdomains/ensjs/public/v2'
import { fromPromise, ok } from 'neverthrow'
import { safeGetNamechainSepoliaClient } from '@/lib/wagmi/helpers'

class GetNameExpiryError extends TaggedError('GetNameExpiryError')<{
  cause: GetExpiryErrorType
}> {}

const getNameExpiry = ResultFn(async function* (params: GetExpiryParameters) {
  const client = yield* safeGetNamechainSepoliaClient()

  const expiry = yield* fromPromise(
    ensjs_getExpiry(client, params),
    (e) => new GetNameExpiryError({ cause: e as GetExpiryErrorType }),
  )
  return ok(expiry)
})

const getNameExpiryQueryKey = createQueryKey<
  'get-name-expiry',
  GetExpiryParameters
>('get-name-expiry')

export const getNameExpiryQueryOptions = (params: GetExpiryParameters) =>
  resultQueryOptions({
    queryKey: getNameExpiryQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getNameExpiry(params),
  })
