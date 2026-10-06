import { readNamesForAddress } from '@ens-apps/indexer/bigname'
import type {
  NameSummary,
  Page,
  ReadNamesForAddress,
} from '@ens-apps/indexer/reads'
import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import { ok } from 'neverthrow'
import type { Address } from 'viem'
import { bigname } from '@/lib/bigname'
import {
  type ProfileAddressName,
  toProfileAddressNames,
} from './buildProfileAddressNames'

export const PROFILE_NAMES_PAGE_SIZE = 5

const FETCH_PAGE_SIZE = 200

/** Every name the address owns or manages, across ENSv1 and ENSv2, all pages. */
export const getProfileAddressNames = ResultFn(async function* (
  readNames: ReadNamesForAddress,
  address: Address,
) {
  let names: readonly NameSummary[] = []
  let cursor: string | null = null
  do {
    const page: Page<NameSummary> = yield* readNames({
      address,
      sort: 'registered',
      order: 'desc',
      pageSize: FETCH_PAGE_SIZE,
      ...(cursor !== null && { cursor }),
    })
    names = [...names, ...page.items]
    cursor = page.nextCursor
  } while (cursor !== null)
  return ok(toProfileAddressNames(names))
})

export const profileAddressNamesQuery = (address?: Address) =>
  resultQueryOptions({
    queryKey: qk('profile', 'address_names', {
      address: address?.toLowerCase(),
    }),
    queryFn: address
      ? () => getProfileAddressNames(readNamesForAddress(bigname), address)
      : skipToken,
    meta: {
      dependsOn: ['indexer'],
    },
  })

export type { ProfileAddressName }
