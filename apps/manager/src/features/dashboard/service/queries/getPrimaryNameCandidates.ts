import type { AddressNameRow } from '@ens-apps/bigname'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { queryOptions, skipToken } from '@tanstack/react-query'
import { bigname } from '@/lib/bigname'
import { isListedAddressName } from '../../dashboardNames'

const PRIMARY_NAME_CANDIDATES_PAGE_SIZE = 100

/**
 * The first 100 ENSv2 names the address holds the token for, by name, as the
 * picker listed them from Panoptes. `is_primary` marks the current primary.
 */
export const getPrimaryNameCandidates = async (
  address: string,
  signal?: AbortSignal,
): Promise<readonly AddressNameRow[]> => {
  const { data } = await bigname.listAddressNames(
    address,
    {
      namespace: 'ens',
      relation: ['owner'],
      authority: 'ens_v2',
      sort: 'name',
      order: 'asc',
      page_size: PRIMARY_NAME_CANDIDATES_PAGE_SIZE,
    },
    { signal },
  )
  return data.filter(isListedAddressName)
}

export const primaryNameCandidatesQuery = (address: string | undefined) => {
  const normalizedAddress = address?.toLowerCase()

  return queryOptions({
    queryKey: qk('dashboard', 'primary_name_candidates', {
      address: normalizedAddress,
    }),
    queryFn: normalizedAddress
      ? ({ signal }) => getPrimaryNameCandidates(normalizedAddress, signal)
      : skipToken,
  })
}
