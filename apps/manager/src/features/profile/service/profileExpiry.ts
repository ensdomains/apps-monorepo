import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  getExpiry as ensjs_GetExpiry,
  type GetExpiryErrorType,
} from '@ensdomains/ensjs/public'
import { skipToken } from '@tanstack/react-query'
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

export const profileExpiryQuery = (name: string | undefined) =>
  resultQueryOptions({
    queryKey: qk('profile', 'expiry', { name }),
    queryFn: name
      ? ({ queryKey: [{ name }] }) =>
          // biome-ignore lint/style/noNonNullAssertion: Null assertion is covered by the skipToken
          getExpiry(name!)
      : skipToken,
  })
