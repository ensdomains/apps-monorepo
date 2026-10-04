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
 * Registrations the address is registrant of. bigname returns an exact
 * `total_count` for authority relations, so one row is enough; a wrapped
 * `.eth` name counts once (one registrar lease).
 */
export const getOwnedNamesCount = ResultFn(async function* (address: string) {
  const { page } = yield* await ResultAsync.fromPromise(
    bigname.listAddressNames(address.toLowerCase(), {
      namespace: 'ens',
      relation: ['registrant'],
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
