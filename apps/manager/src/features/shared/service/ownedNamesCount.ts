import type { BignameError } from '@ens-apps/indexer/bigname'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import type { Address } from 'viem'
import { bigname } from '@/lib/bigname'

export class GetOwnedNamesCountError extends TaggedError(
  'GetOwnedNamesCountError',
)<{
  cause: BignameError
}> {}

/**
 * How many `.eth` registrations the address holds the token of, each counted
 * once even when wrapped. Subnames are left out. Null when bigname cannot give
 * an exact total.
 */
export const getOwnedNamesCount = (address: Address) =>
  bigname
    .addressNames(address.toLowerCase(), {
      relation: ['owner'],
      parent: 'eth',
      dedupe: 'registration',
      include: ['total_count'],
      page_size: 1,
    })
    .map(
      ({ data, page }) =>
        page?.total_count ?? (data.length === 0 && !page?.has_more ? 0 : null),
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
