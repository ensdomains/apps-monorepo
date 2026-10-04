import {
  type AddressNameRow,
  fetchAllPages,
  isBignameError,
  type ListAddressNamesParams,
  MAX_PAGE_SIZE,
} from '@ens-apps/bigname'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { queryOptions, skipToken } from '@tanstack/react-query'
import { bigname } from '@/lib/bigname'
import {
  type DashboardName,
  isListedAddressName,
  mergeAddressNameRows,
  toDashboardName,
} from '../../dashboardNames'

class GetDashboardNamesError extends TaggedError('GetDashboardNamesError')<{
  cause: unknown
}> {}

type AddressNamesOptions = Pick<ListAddressNamesParams, 'sort' | 'order'> & {
  readonly signal?: AbortSignal
}

/**
 * Every name an address holds any authority relation on, v1 and v2 in one
 * collection. `role_summary` feeds the ENSv2 Manager chip; its 1,000-grant
 * budget answers a whole-request `422 unsupported` on overflow, so that case
 * is read again without it and the chips fall back to `relations`.
 */
export const getAllAddressNames = async (
  address: string,
  { sort = 'name', order, signal }: AddressNamesOptions = {},
): Promise<readonly AddressNameRow[]> => {
  const fetchAll = (include?: ListAddressNamesParams['include']) =>
    fetchAllPages(
      (cursor) =>
        bigname.listAddressNames(
          address,
          {
            namespace: 'ens',
            relation: 'any',
            sort,
            order,
            include,
            cursor,
            page_size: MAX_PAGE_SIZE,
          },
          { signal },
        ),
      { signal },
    )

  try {
    return (await fetchAll(['role_summary'])).rows
  } catch (error) {
    if (!isBignameError(error, 'unsupported')) throw error
    return (await fetchAll()).rows
  }
}

export const getDashboardNames = async (
  addresses: readonly string[],
  signal?: AbortSignal,
): Promise<DashboardName[]> => {
  try {
    const rows = await Promise.all(
      addresses.map((address) => getAllAddressNames(address, { signal })),
    )
    return mergeAddressNameRows(rows.flat())
      .filter(isListedAddressName)
      .map((row) => toDashboardName(row, addresses))
  } catch (error) {
    throw new GetDashboardNamesError({ cause: error })
  }
}

export const getDashboardNamesQuery = (
  addresses: readonly string[] | undefined,
) => {
  const normalized = [
    ...new Set(addresses?.map((address) => address.toLowerCase())),
  ]

  return queryOptions({
    queryKey: qk('dashboard', 'names', { addresses: normalized }),
    queryFn:
      normalized.length > 0
        ? ({ signal }) => getDashboardNames(normalized, signal)
        : skipToken,
    meta: {
      dependsOn: ['indexer'],
    },
  })
}
