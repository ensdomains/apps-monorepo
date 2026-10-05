import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import { ok, ResultAsync } from 'neverthrow'
import { getAddressNamesCount } from '@/features/shared/service/addressNamesCount'

class GetMigratedNamesCountError extends TaggedError(
  'GetMigratedNamesCountError',
)<{
  cause: unknown
}> {}

/**
 * Names the address owns whose ENSv2 registration came from an ENSv1→ENSv2
 * migration (`is_migrated=true`). Native ENSv2 registrations do not count.
 *
 * `null` when the address has migrated names but bigname could not count
 * them in time (see `getAddressNamesCount`): at least one, how many unknown.
 */
export const getMigratedNamesCount = ResultFn(async function* (
  address: string,
) {
  const count = yield* await ResultAsync.fromPromise(
    getAddressNamesCount(address.toLowerCase(), {
      relation: ['owner'],
      is_migrated: true,
      dedupe: 'name',
    }),
    (error) => new GetMigratedNamesCountError({ cause: error }),
  )

  return ok(count)
})

export const migratedNamesCountQueryOptions = (
  address?: string,
  enabled: boolean = true,
) =>
  resultQueryOptions({
    queryKey: qk('migration', 'migrated_names_count', {
      address: address?.toLowerCase(),
    }),
    queryFn:
      enabled && address
        ? () => getMigratedNamesCount(address.toLowerCase())
        : skipToken,
    meta: {
      dependsOn: ['indexer'],
    },
  })
