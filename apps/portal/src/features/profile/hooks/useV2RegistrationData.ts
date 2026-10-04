import { isNameProfile, timestampToSeconds } from '@ens-apps/bigname'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise, ok } from 'neverthrow'
import { bigname } from '@/lib/bigname'

class GetV2RegistrationDataError extends TaggedError(
  'GetV2RegistrationDataError',
)<{
  cause: unknown
}> {}

type GetRegistrationDataParameters = { name: string }

/**
 * A name's creation, registration and expiry times, in unix seconds, from
 * bigname's name detail. The fields mean the same for every authority, so this
 * serves ENSv1 names too despite the name. `expiry` is the bare lease expiry
 * (no grace folded in) and is null when the name has none, including an
 * ENSv2 max-uint64 expiry, which bigname omits.
 */
const getV2RegistrationData = ResultFn(async function* ({
  name,
}: GetRegistrationDataParameters) {
  const response = yield* fromPromise(
    bigname.getName(name),
    (e) => new GetV2RegistrationDataError({ cause: e }),
  )

  const detail = response?.data
  if (!detail || !isNameProfile(detail))
    return ok({ createdAt: null, registeredAt: null, expiry: null })

  return ok({
    createdAt: timestampToSeconds(detail.created_at) ?? null,
    registeredAt: timestampToSeconds(detail.registered_at) ?? null,
    expiry: timestampToSeconds(detail.expires_at) ?? null,
  })
})

const getV2RegistrationDataQueryKey = createQueryKey<
  'get-v2-reg-data',
  GetRegistrationDataParameters
>('get-v2-reg-data')

export const getV2RegistrationDataQueryOptions = (
  params: GetRegistrationDataParameters,
) =>
  resultQueryOptions({
    queryKey: getV2RegistrationDataQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getV2RegistrationData(params),
  })
