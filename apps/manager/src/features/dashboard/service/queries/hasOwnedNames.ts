import { iteratePages } from '@ens-apps/bigname'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { queryOptions, skipToken } from '@tanstack/react-query'
import { bigname } from '@/lib/bigname'
import { isListedAddressName } from '../../dashboardNames'

/**
 * Rows read per page. Usually the first row decides; a page this size skips
 * past the registry children an address can own many of.
 */
const OWNED_NAMES_PAGE_SIZE = 50

/**
 * Whether the address holds the token for at least one name the dashboard
 * lists. Plain `fetch` underneath, so it also runs in the landing route's
 * `beforeLoad` on the server.
 *
 * `relation=owner` also lists names the dashboard does not: ENSv1 registry
 * children without a name row (`registration_status: unregistered`, no
 * `created_at`), which bigname serves to their registry owner but whose name
 * pages answer 404. `total_count` counts them too, so rows are read until
 * one the dashboard lists turns up.
 */
export const hasOwnedNames = async (
  address: string,
  signal?: AbortSignal,
): Promise<boolean> => {
  const pages = iteratePages(
    (cursor) =>
      bigname.listAddressNames(
        address.toLowerCase(),
        {
          namespace: 'ens',
          relation: 'owner',
          page_size: OWNED_NAMES_PAGE_SIZE,
          cursor,
        },
        { signal },
      ),
    { signal },
  )
  for await (const page of pages) {
    if (page.data.some(isListedAddressName)) return true
  }
  return false
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
