import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import { errAsync, okAsync } from 'neverthrow'
import { bigname } from '@/lib/bigname'

class GetMigratedNamesCountError extends TaggedError(
  'GetMigratedNamesCountError',
)<{
  cause: unknown
}> {}

/**
 * How many names the address owns that provably moved from ENSv1 to ENSv2.
 * A name registered natively on ENSv2 does not count.
 */
export const getMigratedNamesCount = (address: string) =>
  bigname
    .addressNames(address.toLowerCase(), {
      relation: ['owner'],
      is_migrated: 'true',
      dedupe: 'name',
      include: ['total_count'],
      page_size: 1,
    })
    .mapErr((error) => new GetMigratedNamesCountError({ cause: error }))
    .andThen(({ data, page }) => {
      if (page?.total_count != null) return okAsync(page.total_count)
      if (!page?.has_more) return okAsync(data.length)
      return errAsync(
        new GetMigratedNamesCountError({
          message: 'bigname gave no exact count of upgraded names',
          cause: page,
        }),
      )
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
