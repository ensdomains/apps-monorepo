import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  getExpiry as ensjs_getExpiry,
  type GetExpiryErrorType,
  type GetExpiryParameters,
} from '@ensdomains/ensjs/public'
import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'

export class GetExpiryError extends TaggedError('GetExpiryError')<{
  cause: GetExpiryErrorType
}> {}

export const getExpiry = ResultFn(async function* (
  params: GetExpiryParameters,
) {
  const client = yield* safeGetClient()

  const expiry = yield* await fromPromise(
    ensjs_getExpiry(client, params),
    (e) =>
      new GetExpiryError({
        cause: e as GetExpiryErrorType,
      }),
  )
  return ok(expiry)
})

export const getExpiryQueryKey = createQueryKey<
  'get-expiry',
  GetExpiryParameters
>('get-expiry')

export const getExpiryQueryOptions = (params: GetExpiryParameters) =>
  resultQueryOptions({
    queryKey: getExpiryQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getExpiry(params),
  })
