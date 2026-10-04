import { isNameProfile, timestampToSeconds } from '@ens-apps/bigname'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise, ok } from 'neverthrow'
import { bigname } from '@/lib/bigname'
import { servedExpiry } from '@/utils/names/servedExpiry'

class GetV2RegistrationDataError extends TaggedError(
  'GetV2RegistrationDataError',
)<{
  cause: unknown
}> {}

type GetRegistrationDataParameters = { name: string }

const NO_REGISTRATION_DATA = {
  createdAt: null,
  registeredAt: null,
  expiry: null,
  graceEndsAt: null,
} as const

/**
 * A name's creation, registration and expiry times, in unix seconds, from
 * bigname's name detail. Despite the name it serves every authority.
 *
 * `expiry` and `graceEndsAt` are the deadlines the name's own protocol
 * enforces (`servedExpiry`): for a name ENSv1 decides, the BaseRegistrar
 * lease (`ens_v1.expires_at`) and its 90-day grace, not the ENSv2
 * reservation bigname serves at the top level; otherwise the served
 * `expires_at` and `grace_ends_at`. Both are null when the name has no
 * expiry, including an ENSv2 max-uint64 one (`expires_at: null`).
 */
const getV2RegistrationData = ResultFn(async function* ({
  name,
}: GetRegistrationDataParameters) {
  const response = yield* fromPromise(
    bigname.getName(name),
    (e) => new GetV2RegistrationDataError({ cause: e }),
  )

  const detail = response?.data
  if (!detail || !isNameProfile(detail)) return ok(NO_REGISTRATION_DATA)

  return ok({
    createdAt: timestampToSeconds(detail.created_at) ?? null,
    registeredAt: timestampToSeconds(detail.registered_at) ?? null,
    ...servedExpiry(detail),
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
