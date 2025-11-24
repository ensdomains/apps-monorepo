import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  type GetAddressRecordErrorType,
  getAddressRecord,
} from '@ensdomains/ensjs/public'
import { skipToken } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetAddressError extends TaggedError('GetAddressError')<{
  cause: GetAddressRecordErrorType
}> {}

class MissingProfileError extends TaggedError('MissingProfileError')<{}> {}

export const getAddress = ResultFn(async function* (name: string) {
  const client = yield* safeGetClient()

  const result = yield* await fromPromise(
    getAddressRecord(client, { name }),
    (e) => new GetAddressError({ cause: e as GetAddressRecordErrorType }),
  )

  if (!result) {
    return yield* new MissingProfileError()
  }

  return ok(result.value)
})

export const profileAddressQuery = (name: string | undefined) =>
  resultQueryOptions({
    queryKey: qk('profile', 'address', { name }),
    queryFn: name
      ? ({ queryKey: [{ name }] }) =>
          // biome-ignore lint/style/noNonNullAssertion: Null assertion is covered by the skipToken
          getAddress(name!)
      : skipToken,
  })
