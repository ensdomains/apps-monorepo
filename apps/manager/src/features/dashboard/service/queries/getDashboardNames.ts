import {
  type AddressName,
  type AddressNamesQuery,
  type AddressNamesResponse,
  type BignameClient,
  type BignameError,
  isStale,
  readNamesForAddress,
} from '@ens-apps/indexer/bigname'
import type {
  NamesForAddressQuery,
  ReadNamesForAddress,
} from '@ens-apps/indexer/reads'
import { V2_GRACE_PERIOD_DAYS } from '@ens-apps/utils/gracePeriod'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import {
  resultInfiniteQueryOptions,
  resultQueryOptions,
} from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import { errAsync, ok, okAsync, ResultAsync } from 'neverthrow'
import type { Address } from 'viem'
import {
  readAllNames,
  readNamesPage,
} from '@/features/shared/service/readNamePages'
import { bigname } from '@/lib/bigname'
import { toBulkRenewName, toSelectableDomain } from '../../bulkRenewSelection'
import {
  type AddressNamesChunk,
  type DashboardName,
  isListedName,
  mergeDashboardNames,
  type SortDir,
  type SortField,
  toDashboardName,
  toGraceName,
} from '../../dashboardNames'

const FETCH_PAGE_SIZE = 200
const SECONDS_PER_DAY = 86_400

export class GetDashboardNamesError extends TaggedError(
  'GetDashboardNamesError',
)<{
  cause: unknown
}> {}

const MAX_STALE_ATTEMPTS = 3

// bigname's cursors hold no snapshot, so a stale page is sent again as is.
const readGracePage = (
  addressNames: BignameClient['addressNames'],
  address: Address,
  query: AddressNamesQuery,
  attemptsLeft = MAX_STALE_ATTEMPTS,
): ResultAsync<AddressNamesResponse, BignameError> =>
  addressNames(address, query).orElse((error) =>
    isStale(error) && attemptsLeft > 1
      ? readGracePage(addressNames, address, query, attemptsLeft - 1)
      : errAsync(error),
  )

/** `relation=any` drops an ENSv2 name once it expires, but it stays renewable through grace. */
const getGraceNames = ResultFn(async function* (
  addressNames: BignameClient['addressNames'],
  address: Address,
  now: Date,
) {
  const nowSeconds = Math.floor(now.getTime() / 1000)
  let rows: readonly AddressName[] = []
  let cursor: string | null = null
  do {
    const query: AddressNamesQuery = {
      namespace: 'ens',
      relation: 'former_owner',
      parent: 'eth',
      sort: 'expires_at',
      order: 'asc',
      expires_after: String(
        nowSeconds - V2_GRACE_PERIOD_DAYS * SECONDS_PER_DAY,
      ),
      expires_before: String(nowSeconds + 1),
      page_size: FETCH_PAGE_SIZE,
      ...(cursor !== null && { cursor }),
    }
    const page: AddressNamesResponse = yield* readGracePage(
      addressNames,
      address,
      query,
    ).mapErr((error) => new GetDashboardNamesError({ cause: error }))
    rows = [...rows, ...page.data]
    cursor = page.page?.next_cursor ?? null
  } while (cursor !== null)
  return ok(rows.flatMap((row) => toGraceName(row, address, now) ?? []))
})

// Rows per read: a page of the dashboard is five, so this covers several pages.
export const DASHBOARD_CHUNK_SIZE = 50

const SORTS: Readonly<Record<SortField, NamesForAddressQuery['sort']>> = {
  name: 'name',
  expiry: 'expiry',
  created: 'created',
}

export type DashboardNamesQuery = {
  readonly addresses: readonly Address[]
  readonly sortField: SortField
  readonly sortDir: SortDir
  /** A fragment the names contain; empty lists everything. */
  readonly search: string
}

/** Each address's cursor; an address not yet read has none, an exhausted one `null`. */
export type DashboardCursors = Readonly<Record<string, string | null>>

const readChunk = (
  readNames: ReadNamesForAddress,
  query: DashboardNamesQuery,
  address: Address,
  cursor: string | undefined,
): ResultAsync<AddressNamesChunk, GetDashboardNamesError> =>
  readNamesPage(readNames, {
    address,
    sort: SORTS[query.sortField],
    order: query.sortDir,
    pageSize: DASHBOARD_CHUNK_SIZE,
    ...(query.search && { contains: query.search }),
    ...(cursor === undefined ? { includeTotal: true } : { cursor }),
  })
    .map((page): AddressNamesChunk => {
      const listed = page.items.filter(isListedName)
      return {
        address,
        names: listed.map(toDashboardName),
        hiddenCount: page.items.length - listed.length,
        nextCursor: page.nextCursor,
        totalCount: page.totalCount,
      }
    })
    .orElse((error) =>
      // A search that is not a valid name fragment matches nothing.
      error.kind === 'rejected' && query.search
        ? okAsync<AddressNamesChunk, GetDashboardNamesError>({
            address,
            names: [],
            hiddenCount: 0,
            nextCursor: null,
            totalCount: 0,
          })
        : errAsync(new GetDashboardNamesError({ cause: error })),
    )

/** The next chunk of every address that has more, read side by side. */
export const readDashboardChunks = (
  readNames: ReadNamesForAddress,
  query: DashboardNamesQuery,
  cursors: DashboardCursors,
) =>
  ResultAsync.combine(
    query.addresses.flatMap((address) => {
      const cursor = cursors[address]
      return cursor === null
        ? []
        : [readChunk(readNames, query, address, cursor)]
    }),
  )

const nextCursors = (
  cursors: DashboardCursors,
  chunks: readonly AddressNamesChunk[],
): DashboardCursors | undefined => {
  const next = {
    ...cursors,
    ...Object.fromEntries(
      chunks.map(({ address, nextCursor }) => [address, nextCursor]),
    ),
  }
  return Object.values(next).some((cursor) => cursor !== null)
    ? next
    : undefined
}

const START: DashboardCursors = {}

export const getDashboardNamesInfiniteQueryOptions = (
  query: DashboardNamesQuery,
) =>
  resultInfiniteQueryOptions({
    queryKey: qk('dashboard', 'names', {
      addresses: query.addresses.map((address) => address.toLowerCase()),
      sortField: query.sortField,
      sortDir: query.sortDir,
      search: query.search,
    }),
    initialPageParam: START,
    queryFn: ({ pageParam }) =>
      readDashboardChunks(readNamesForAddress(bigname), query, pageParam),
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      nextCursors(lastPageParam, lastPage),
    enabled: query.addresses.length > 0,
    meta: {
      dependsOn: ['indexer'],
    },
  })

/** The connected addresses' ENSv2 names in grace, which `relation=any` no longer lists. */
export const getDashboardGraceNames = (
  addressNames: BignameClient['addressNames'],
  addresses: readonly Address[],
  now: Date = new Date(),
) =>
  ResultAsync.combine(
    addresses.map((address) => getGraceNames(addressNames, address, now)),
  ).map((collections) => mergeDashboardNames(collections.flat()))

export const getDashboardGraceNamesQueryOptions = (
  addresses: readonly Address[],
) =>
  resultQueryOptions({
    queryKey: qk('dashboard', 'grace_names', {
      addresses: addresses.map((address) => address.toLowerCase()),
    }),
    queryFn:
      addresses.length > 0
        ? () => getDashboardGraceNames(bigname.addressNames, addresses)
        : skipToken,
    meta: {
      dependsOn: ['indexer'],
    },
  })

const isRenewable = (name: DashboardName) =>
  toBulkRenewName(toSelectableDomain(name)) !== null

/** Every held ENSv2 `.eth` name that can be renewed, for bulk renewal's select-all. */
export const getRenewableDashboardNames = ResultFn(async function* (
  readNames: ReadNamesForAddress,
  addressNames: BignameClient['addressNames'],
  addresses: readonly Address[],
  search: string,
) {
  const owned = yield* ResultAsync.combine(
    addresses.map((address) =>
      readAllNames(readNames, {
        address,
        relations: ['owner'],
        protocol: 'v2',
        parent: 'eth',
        ...(search && { contains: search }),
      }),
    ),
  ).mapErr((error) => new GetDashboardNamesError({ cause: error }))
  const lapsed = yield* getDashboardGraceNames(addressNames, addresses)
  const searchLower = search.toLowerCase()
  return ok(
    mergeDashboardNames([
      ...owned.flat().filter(isListedName).map(toDashboardName),
      ...lapsed.filter((name) => name.name.includes(searchLower)),
    ]).filter(isRenewable),
  )
})

export const getRenewableDashboardNamesQueryOptions = (
  addresses: readonly Address[],
  search: string,
) =>
  resultQueryOptions({
    queryKey: qk('dashboard', 'renewable_names', {
      addresses: addresses.map((address) => address.toLowerCase()),
      search,
    }),
    queryFn: () =>
      getRenewableDashboardNames(
        readNamesForAddress(bigname),
        bigname.addressNames,
        addresses,
        search,
      ),
    meta: {
      dependsOn: ['indexer'],
    },
  })
