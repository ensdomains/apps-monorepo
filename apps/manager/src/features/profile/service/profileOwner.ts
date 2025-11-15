import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  getOwner as ensjs_GetOwner,
  type GetOwnerErrorType,
} from '@ensdomains/ensjs/public'
import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetOwnerError extends TaggedError('GetOwnerError')<{
  cause: GetOwnerErrorType
}> {}

class MissingOwnerError extends TaggedError('MissingOwnerError')<
  Record<string, never>
> {}

export const getOwner = ResultFn(async function* (name: string) {
  const client = yield* safeGetClient()

  const result = yield* await fromPromise(
    ensjs_GetOwner(client, { name }),
    (e) => new GetOwnerError({ cause: e as GetOwnerErrorType }),
  )

  if (!result) {
    return yield* new MissingOwnerError({})
  }

  return ok(result)
})

export const profileOwnerQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'owner', { name }),
    queryFn: ({ queryKey: [{ name }] }) => getOwner(name),
  })
