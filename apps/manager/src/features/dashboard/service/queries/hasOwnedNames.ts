import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { queryOptions, skipToken } from '@tanstack/react-query'
import { bigname } from '@/lib/bigname'

/**
 * Whether the address holds the token for at least one name. Plain `fetch`
 * underneath, so it also runs in the landing route's `beforeLoad` on the
 * server. `total_count` is exact for authority relations.
 */
export const hasOwnedNames = async (
  address: string,
  signal?: AbortSignal,
): Promise<boolean> => {
  const { data, page } = await bigname.listAddressNames(
    address.toLowerCase(),
    { namespace: 'ens', relation: ['owner'], page_size: 1 },
    { signal },
  )
  return (page.total_count ?? data.length) > 0
}

export const hasOwnedNamesQuery = (address: string | undefined) => {
  const normalizedAddress = address?.toLowerCase()

  return queryOptions({
    queryKey: qk('dashboard', 'has_owned_names', {
      address: normalizedAddress,
    }),
    queryFn: normalizedAddress
      ? ({ signal }) => hasOwnedNames(normalizedAddress, signal)
      : skipToken,
  })
}
