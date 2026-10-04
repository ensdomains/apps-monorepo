import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import { ok, ResultAsync } from 'neverthrow'
import { bigname } from '@/lib/bigname'

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
 * also list under `owner`; a wrapped `.eth` name counts once. bigname returns
 * an exact `total_count` for authority relations, so one row is enough.
 */
export const getOwnedNamesCount = ResultFn(async function* (address: string) {
  const { page } = yield* await ResultAsync.fromPromise(
    bigname.listAddressNames(address.toLowerCase(), {
      namespace: 'ens',
      relation: 'owner',
      parent: 'eth',
      dedupe: 'registration',
      page_size: 1,
    }),
    (error) => new GetOwnedNamesCountError({ cause: error }),
  )

  return ok(page.total_count ?? 0)
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
