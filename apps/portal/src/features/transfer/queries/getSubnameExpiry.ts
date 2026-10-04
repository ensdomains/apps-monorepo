import { fromSync, ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { type GetExpiryErrorType, getExpiry } from '@ensdomains/ensjs/public/v2'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { normalize } from 'viem/ens'
import { safeGetClient } from '@/lib/wagmi/helpers'

class SubnameNotNormalizableError extends TaggedError(
  'SubnameNotNormalizableError',
)<{
  cause: unknown
}> {}

class GetSubnameExpiryError extends TaggedError('GetSubnameExpiryError')<{
  cause: GetExpiryErrorType
}> {}

type GetSubnameExpiryParameters = {
  readonly name: string
  /** The registry the name's token lives in (its parent's subregistry). */
  readonly registryAddress: Address
}

/**
 * A v2 subname's expiry, read from the registry that holds its token.
 *
 * Deliberately not `useGraceStatus`: its v2 path reads `expires_at` from
 * bigname and applies `V2_GRACE_PERIOD_DAYS`, which is `.eth` registrar
 * semantics. A parent-issued subname has no registrar and no grace period — it
 * simply stops being owned, at which point the parent can re-issue it to anyone.
 */
const getSubnameExpiry = ResultFn(async function* ({
  name,
  registryAddress,
}: GetSubnameExpiryParameters) {
  const normalized = yield* fromSync(
    () => normalize(name),
    (e) => new SubnameNotNormalizableError({ cause: e }),
  )

  const client = yield* safeGetClient()

  const expiry = yield* fromPromise(
    getExpiry(client, { name: normalized, registryAddress }),
    (e) => new GetSubnameExpiryError({ cause: e as GetExpiryErrorType }),
  )

  return ok(expiry)
})

const getSubnameExpiryQueryKey = createQueryKey<
  'get-subname-expiry',
  GetSubnameExpiryParameters
>('get-subname-expiry')

export const getSubnameExpiryQueryOptions = (
  params: GetSubnameExpiryParameters,
) =>
  resultQueryOptions({
    queryKey: getSubnameExpiryQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getSubnameExpiry(params),
  })
