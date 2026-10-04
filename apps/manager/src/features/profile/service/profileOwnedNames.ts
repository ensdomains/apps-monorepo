import type { AddressNameRow, BignamePage } from '@ens-apps/bigname'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { bigname } from '@/lib/bigname'

export const PROFILE_NAMES_PAGE_SIZE = 5

class GetProfileOwnedNamesError extends TaggedError(
  'GetProfileOwnedNamesError',
)<{
  cause: unknown
}> {}

/**
 * One page of the names an address holds the token for, newest registration
 * first. Pass the previous page's `page.next_cursor` to read the next one; a
 * `409 stale` cursor means the index moved on and the list restarts.
 */
const getProfileOwnedNames = ResultFn(async function* (
  address: Address,
  cursor?: string,
) {
  const page = yield* fromPromise(
    bigname.listAddressNames(address.toLowerCase(), {
      namespace: 'ens',
      relation: ['owner'],
      sort: 'registered_at',
      order: 'desc',
      page_size: PROFILE_NAMES_PAGE_SIZE,
      cursor,
    }),
    (error) => new GetProfileOwnedNamesError({ cause: error }),
  )

  return ok<BignamePage<AddressNameRow>>(page)
})

export const profileOwnedNamesQuery = (
  address?: Address,
  { cursor }: { cursor?: string } = {},
) =>
  resultQueryOptions({
    queryKey: qk('profile', 'owned_names', { address, cursor }),
    queryFn: address ? () => getProfileOwnedNames(address, cursor) : skipToken,
    meta: {
      dependsOn: ['indexer'],
    },
  })
