import { readNamesForAddress } from '@ens-apps/indexer/bigname'
import type { ReadNamesForAddress } from '@ens-apps/indexer/reads'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import type { Address } from 'viem'
import { readAllNames } from '@/features/shared/service/readNamePages'
import { bigname } from '@/lib/bigname'
import {
  type ProfileAddressName,
  toProfileAddressNames,
} from './buildProfileAddressNames'

export const PROFILE_NAMES_PAGE_SIZE = 5

/** Every name the address owns or manages, across ENSv1 and ENSv2, all pages. */
export const getProfileAddressNames = (
  readNames: ReadNamesForAddress,
  address: Address,
) =>
  readAllNames(readNames, { address, sort: 'registered', order: 'desc' }).map(
    toProfileAddressNames,
  )

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
