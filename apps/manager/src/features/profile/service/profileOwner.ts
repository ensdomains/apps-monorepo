import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  getOwner as ensjsGetOwner,
  type GetOwnerErrorType,
} from '@ensdomains/ensjs/public'
import { skipToken } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetOwnerError extends TaggedError('GetOwnerError')<{
  cause: GetOwnerErrorType
}> {}

class MissingOwnerError extends TaggedError('MissingOwnerError')<{}> {}

export const getOwner = ResultFn(async function* (name: string) {
  const client = yield* safeGetClient()

  const result = yield* await fromPromise(
    ensjsGetOwner(client, {
      name,
    }),
    (e) => new GetOwnerError({ cause: e as GetOwnerErrorType }),
  )

  if (!result) {
    return yield* new MissingOwnerError()
  }

  return ok(result)
})

export const ownerQuery = (name: string | undefined) =>
  resultQueryOptions({
    queryKey: qk('profile', 'owner', { name }),
    queryFn: name
      ? ({ queryKey: [{ name }] }) =>
          // biome-ignore lint/style/noNonNullAssertion: Null assertion is covered by the skipToken
          getOwner(name!)
      : skipToken,
  })
