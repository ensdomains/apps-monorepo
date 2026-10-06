import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import { ok, ResultAsync } from 'neverthrow'
import { getAddressNamesCount } from './addressNamesCount'

export class GetOwnedNamesCountError extends TaggedError(
  'GetOwnedNamesCountError',
)<{
  cause: unknown
}> {}

/**
 * `.eth` registrations the address holds the token of: bigname's documented
 * count recipe (`relation=owner&parent=eth&dedupe=registration`). `owner` is
 * the BaseRegistrar, NameWrapper or ENSv2 token holder (bigname v0.3.0
 * removed `registrant`); `parent=eth` keeps out the tokenless subnames that
 * also list under `owner`; a wrapped `.eth` name counts once.
 *
 * `null` when the exact count is unavailable or its deadline expires
 * (see `getAddressNamesCount`). This can happen at any collection size;
 * automatic primary-name setup waits until a count is known.
 */
export const getOwnedNamesCount = ResultFn(async function* (address: string) {
  const count = yield* await ResultAsync.fromPromise(
    getAddressNamesCount(address.toLowerCase(), {
      namespace: 'ens',
      relation: 'owner',
      parent: 'eth',
      dedupe: 'registration',
    }),
    (error) => new GetOwnedNamesCountError({ cause: error }),
  )

  return ok(count)
})

const ownedNamesCountQueryKey = (address?: string) =>
  qk('owned_names_count', {
    address: address?.toLowerCase(),
  })

export const ownedNamesCountQueryOptions = (address?: string) =>
  resultQueryOptions({
    queryKey: ownedNamesCountQueryKey(address),
    queryFn: address ? () => getOwnedNamesCount(address) : skipToken,
    meta: {
      dependsOn: ['indexer'],
    },
  })
