import type { IndexerReadError } from '@ens-apps/indexer/reads'
import { retryStaleRead } from '@ens-apps/indexer/reads'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import { errAsync, okAsync } from 'neverthrow'
import type { Address } from 'viem'
import { indexer } from '@/lib/indexer'

class GetMigratedNamesCountError extends TaggedError(
  'GetMigratedNamesCountError',
)<{
  /** Absent when the indexer answered but gave no exact count. */
  cause: IndexerReadError | undefined
}> {}

/**
 * How many names the address owns that provably moved from ENSv1 to ENSv2.
 * A name registered natively on ENSv2 does not count.
 */
export const getMigratedNamesCount = (address: Address) =>
  retryStaleRead((signal) =>
    indexer.getNamesForAddress(
      {
        address: address.toLowerCase() as Address,
        relations: ['owner'],
        migratedOnly: true,
        distinctBy: 'name',
        includeTotal: true,
        pageSize: 1,
      },
      { signal },
    ),
  )
    .mapErr((error) => new GetMigratedNamesCountError({ cause: error }))
    .andThen(({ items, nextCursor, totalCount }) => {
      if (totalCount !== null) return okAsync(totalCount)
      if (nextCursor === null) return okAsync(items.length)
      return errAsync(
        new GetMigratedNamesCountError({
          message: 'the indexer gave no exact count of upgraded names',
          cause: undefined,
        }),
      )
    })

export const migratedNamesCountQueryOptions = (
  address?: Address,
  enabled: boolean = true,
) =>
  resultQueryOptions({
    queryKey: qk('migration', 'migrated_names_count', {
      address: address?.toLowerCase(),
    }),
    queryFn:
      enabled && address ? () => getMigratedNamesCount(address) : skipToken,
    meta: {
      dependsOn: ['indexer'],
    },
  })
