import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { type GetEnsNameErrorType, getEnsName } from 'viem/ens'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetEnsNameError extends TaggedError('GetEnsNameError')<{
  cause: GetEnsNameErrorType
}> {}

class MissingReverseNameError extends TaggedError(
  'MissingReverseNameError',
)<{}> {}

export const getReverseName = ResultFn(async function* (address: Address) {
  const client = yield* safeGetClient()

  const result = yield* await fromPromise(
    getEnsName(client, { address }),
    (e) => new GetEnsNameError({ cause: e as GetEnsNameErrorType }),
  )

  console.log('result', result)

  if (!result) {
    return yield* new MissingReverseNameError()
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
