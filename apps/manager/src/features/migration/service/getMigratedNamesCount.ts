import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import { ok, ResultAsync } from 'neverthrow'
import { bigname } from '@/lib/bigname'

class GetMigratedNamesCountError extends TaggedError(
  'GetMigratedNamesCountError',
)<{
  cause: unknown
}> {}

/**
 * Names the address owns whose ENSv2 registration came from an ENSv1→ENSv2
 * migration (`is_migrated=true`). Native ENSv2 registrations do not count.
 * The collection's `total_count` is exact, so one row is enough.
 */
export const getMigratedNamesCount = ResultFn(async function* (
  address: string,
) {
  const page = yield* await ResultAsync.fromPromise(
    bigname.listAddressNames(address.toLowerCase(), {
      relation: ['owner'],
      is_migrated: true,
      dedupe: 'name',
      page_size: 1,
    }),
    (error) => new GetMigratedNamesCountError({ cause: error }),
  )

  return ok(page.page.total_count ?? 0)
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
