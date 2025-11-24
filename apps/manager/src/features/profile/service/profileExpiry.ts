import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  getExpiry as ensjs_GetExpiry,
  type GetExpiryErrorType,
} from '@ensdomains/ensjs/public'
import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetExpiryError extends TaggedError('GetExpiryError')<{
  cause: GetExpiryErrorType
}> {}

export const getExpiry = ResultFn(async function* (name: string) {
  const client = yield* safeGetClient()

  const result = yield* await fromPromise(
    ensjs_GetExpiry(client, { name }),
    (e) => new GetExpiryError({ cause: e as GetExpiryErrorType }),
  )

  return ok(result)
})

export const profileExpiryQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'expiry', { name }),
    queryFn: ({ queryKey: [{ name }] }) => getExpiry(name),
  })
