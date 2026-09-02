import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { type GetExpiryErrorType, getExpiry } from '@ensdomains/ensjs/public/v2'
import { useQuery } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetSubnameExpiryError extends TaggedError('GetSubnameExpiryError')<{
  cause: GetExpiryErrorType
}> {}

type GetSubnameExpiryParameters = {
  name: string
  /** The registry the name's token lives in (its parent's subregistry). */
  registryAddress: Address
}

/**
 * A v2 subname's expiry, read from the registry that holds its token.
 *
 * Deliberately not `useGraceStatus`: its v2 path reads `expiryDate` from the
 * indexer and applies `V2_GRACE_PERIOD_DAYS`, which is `.eth` registrar
 * semantics. A parent-issued subname has no registrar and no grace period — it
 * simply stops being owned, at which point the parent can re-issue it to anyone.
 */
const getSubnameExpiry = ResultFn(async function* ({
  name,
  registryAddress,
}: GetSubnameExpiryParameters) {
  const client = yield* safeGetClient()

  const expiry = yield* fromPromise(
    getExpiry(client, { name, registryAddress }),
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

type UseSubnameExpiryReturn = {
  /** The subname's registration has lapsed — the parent can re-issue it. */
  readonly isExpired: boolean
  readonly isLoading: boolean
  /** The expiry lookup failed — expiry is unknown, not "fine". */
  readonly isError: boolean
}

/**
 * Whether a subname has already expired, so the transfer page can refuse rather
 * than hand a recipient a name the parent can immediately take back.
 *
 * An expiry of `0` means the registry has no expiry set for the label — a
 * non-expiring subname — and must not be read as "expired at the epoch".
 */
export const useSubnameExpiry = ({
  name,
  registryAddress,
  enabled = true,
}: GetSubnameExpiryParameters & {
  enabled?: boolean
}): UseSubnameExpiryReturn => {
  const query = useQuery({
    ...getSubnameExpiryQueryOptions({ name, registryAddress }),
    enabled,
  })

  const expiry = query.data
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000))

  return {
    isExpired: expiry !== undefined && expiry !== 0n && expiry <= nowSeconds,
    isLoading: enabled && query.isLoading,
    isError: query.isError,
  }
}
