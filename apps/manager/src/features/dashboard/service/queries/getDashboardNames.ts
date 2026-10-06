import {
  type AddressNameRow,
  fetchAllPages,
  fetchRoleSummaryPage,
  fetchV2GraceNames,
  type ListAddressNamesParams,
} from '@ens-apps/bigname'
import {
  SECONDS_PER_DAY,
  V2_GRACE_PERIOD_DAYS,
} from '@ens-apps/utils/gracePeriod'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  type QueryClient,
  queryOptions,
  skipToken,
} from '@tanstack/react-query'
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
  readonly includeGrace?: boolean
}

/**
 * Every name an address holds any authority relation on, v1 and v2 in one
 * collection. `role_summary` feeds the ENSv2 Manager chip; its 1,000-grant
 * budget answers a whole-request `422 unsupported` on overflow, so that case
 * shrinks the page first. Only a single overflowing name loses its summary.
 * Former owners' renewable ENSv2 names require a separate collection.
 */
export const getAllAddressNames = async (
  address: string,
  {
    sort = 'name',
    order,
    signal,
    includeGrace = false,
  }: AddressNamesOptions = {},
): Promise<readonly AddressNameRow[]> => {
  const [current, grace] = await Promise.all([
    fetchAllPages(
      (cursor) =>
        fetchRoleSummaryPage((pageSize, withRoles) =>
          bigname.listAddressNames(
            address,
            {
              namespace: 'ens',
              relation: 'any',
              sort,
              order,
              include: withRoles ? ['role_summary'] : undefined,
              cursor,
              page_size: pageSize,
            },
            { signal },
          ),
        ),
      { signal },
    ),
    includeGrace
      ? fetchV2GraceNames(bigname, address, {
          signal,
          gracePeriodSeconds: V2_GRACE_PERIOD_DAYS * SECONDS_PER_DAY,
        })
      : Promise.resolve([]),
  ])
  if (current.truncated)
    throw new Error(
      `Dashboard name list for ${address} exceeded ${current.rows.length}`,
    )
  return mergeAddressNameRows([...current.rows, ...grace])
}

export type DashboardAddressRows = {
  readonly address: string
  readonly rows: readonly AddressNameRow[]
}

/** Current authority is independent of grace and every other connected address. */
export const getDashboardAuthorityNamesQuery = (address: string) =>
  queryOptions({
    queryKey: qk('dashboard', 'names', {
      source: 'authority',
      address: address.toLowerCase(),
    }),
    queryFn: ({ signal }) =>
      getAllAddressNames(address.toLowerCase(), { signal }),
    staleTime: 5 * 60 * 1000,
    meta: { dependsOn: ['indexer'] },
  })

export const readDashboardAuthorityNames = (
  queryClient: QueryClient,
  address: string,
  previousReadAt = 0,
) => {
  const source = getDashboardAuthorityNamesQuery(address)
  const state = queryClient.getQueryState(source.queryKey)
  return queryClient.fetchQuery({
    ...source,
    // Refetches must refresh an already-consumed snapshot (e.g. after renewal).
    ...((state?.dataUpdatedAt ?? 0) <= previousReadAt ? { staleTime: 0 } : {}),
  })
}

const getDashboardNameRows = async (
  addresses: readonly string[],
  signal?: AbortSignal,
  cache?: { readonly client: QueryClient; readonly previousReadAt: number },
): Promise<readonly DashboardAddressRows[]> => {
  try {
    return await Promise.all(
      addresses.map(async (address) => {
        if (!cache)
          return {
            address,
            rows: await getAllAddressNames(address, {
              signal,
              includeGrace: true,
            }),
          }
        const [current, grace] = await Promise.all([
          readDashboardAuthorityNames(
            cache.client,
            address,
            cache.previousReadAt,
          ),
          fetchV2GraceNames(bigname, address, {
            signal,
            gracePeriodSeconds: V2_GRACE_PERIOD_DAYS * SECONDS_PER_DAY,
          }),
        ])
        return { address, rows: mergeAddressNameRows([...current, ...grace]) }
      }),
    )
  } catch (error) {
    throw new GetDashboardNamesError({ cause: error })
  }
}

const dashboardNamesFromRows = (
  collections: readonly DashboardAddressRows[],
): DashboardName[] => {
  const addresses = collections.map(({ address }) => address)
  return mergeAddressNameRows(collections.flatMap(({ rows }) => rows))
    .filter(isListedAddressName)
    .map((row) => toDashboardName(row, addresses))
}

export const getDashboardNames = async (
  addresses: readonly string[],
  signal?: AbortSignal,
): Promise<DashboardName[]> =>
  dashboardNamesFromRows(await getDashboardNameRows(addresses, signal))

/** Shared source for the dashboard and its migration discovery consumers. */
export const getDashboardNameRowsQuery = (
  addresses: readonly string[] | undefined,
) => {
  const normalized = [
    ...new Set(addresses?.map((address) => address.toLowerCase())),
  ].sort()

  return queryOptions({
    queryKey: qk('dashboard', 'names', { addresses: normalized }),
    queryFn:
      normalized.length > 0
        ? ({ signal, client, queryKey }) =>
            getDashboardNameRows(normalized, signal, {
              client,
              previousReadAt:
                client.getQueryState(queryKey)?.dataUpdatedAt ?? 0,
            })
        : skipToken,
    staleTime: 5 * 60 * 1000,
    // Renewal may happen in another tab; refresh the shared source on return.
    refetchOnWindowFocus: 'always',
    meta: {
      dependsOn: ['indexer'],
    },
  })
}

export const getDashboardNamesQuery = (
  addresses: readonly string[] | undefined,
) => ({
  ...getDashboardNameRowsQuery(addresses),
  select: dashboardNamesFromRows,
})
