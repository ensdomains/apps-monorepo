import type { IndexerReadError } from '@ens-apps/indexer/reads'
import { retryStaleRead } from '@ens-apps/indexer/reads'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import type { Address } from 'viem'
import { indexer } from '@/lib/indexer'

export class GetOwnedNamesCountError extends TaggedError(
  'GetOwnedNamesCountError',
)<{
  cause: IndexerReadError
}> {}

/**
 * How many `.eth` registrations the address holds the token of, each counted
 * once even when wrapped. Subnames are left out. Null when the indexer cannot
 * give an exact total.
 */
export const getOwnedNamesCount = (address: Address) =>
  retryStaleRead((signal) =>
    indexer.getNamesForAddress(
      {
        address: address.toLowerCase() as Address,
        relations: ['owner'],
        parent: 'eth',
        distinctBy: 'registration',
        includeTotal: true,
        pageSize: 1,
      },
      { signal },
    ),
  )
    .map(
      ({ items, nextCursor, totalCount }) =>
        totalCount ?? (items.length === 0 && nextCursor === null ? 0 : null),
    )
    .mapErr((error) => new GetOwnedNamesCountError({ cause: error }))

const ownedNamesCountQueryKey = (address?: Address) =>
  qk('owned_names_count', {
    address: address?.toLowerCase(),
  })

export const ownedNamesCountQueryOptions = (address?: Address) =>
  resultQueryOptions({
    queryKey: ownedNamesCountQueryKey(address),
    queryFn: address ? () => getOwnedNamesCount(address) : skipToken,
    meta: {
      dependsOn: ['indexer'],
    },
  })
