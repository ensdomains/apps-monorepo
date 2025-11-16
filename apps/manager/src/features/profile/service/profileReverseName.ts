import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { type GetNameErrorType, getName } from '@ensdomains/ensjs/public'
import { skipToken } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetNameError extends TaggedError('GetNameError')<{
  cause: GetNameErrorType
}> {}

class MissingReverseNameError extends TaggedError(
  'MissingReverseNameError',
)<{}> {}

export const getReverseName = ResultFn(async function* (address: Address) {
  const client = yield* safeGetClient()

  const result = yield* await fromPromise(
    getName(client, { address }),
    (e) => new GetNameError({ cause: e as GetNameErrorType }),
  )

  if (!result) {
    return yield* new MissingReverseNameError({})
  }

  return ok(result)
})

export const profileReverseNameQuery = (address: Address | undefined) =>
  resultQueryOptions({
    queryKey: qk('profile', 'reverse_name', { address }),
    queryFn: address
      ? ({ queryKey: [{ address }] }) =>
          // biome-ignore lint/style/noNonNullAssertion: Null assertion is covered by the skipToken
          getReverseName(address!)
      : skipToken,
  })
