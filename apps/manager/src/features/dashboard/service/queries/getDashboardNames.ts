import {
  type BignameClient,
  type BignameError,
  readGraceNames,
  readNamesForAddress,
} from '@ens-apps/indexer/bigname'
import type {
  IndexerReadError,
  NamesForAddressQuery,
  ReadNamesForAddress,
} from '@ens-apps/indexer/reads'
import { readAllNames, readNamesPage } from '@ens-apps/indexer/reads'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import {
  resultInfiniteQueryOptions,
  resultQueryOptions,
} from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { type QueryClient, skipToken } from '@tanstack/react-query'
import { errAsync, ok, okAsync, ResultAsync } from 'neverthrow'
import type { Address } from 'viem'
import { resolverWriteAccessQuery } from '@/features/profile/service/resolverWriteAccess'
import { bigname } from '@/lib/bigname'
import { toBulkRenewName, toSelectableDomain } from '../../bulkRenewSelection'
import {
  type AddressNamesChunk,
  type DashboardName,
  isListedName,
  mergeDashboardNames,
  type NameVersion,
  type SortDir,
  type SortField,
  toDashboardName,
  toGraceName,
} from '../../dashboardNames'
import {
  getDashboardNameVisibility,
  type ReadDashboardNameVisibility,
} from '../../dashboardNameVisibility'

const NAMES_ACTION = 'names'
const GRACE_NAMES_ACTION = 'grace_names'
const RENEWABLE_NAMES_ACTION = 'renewable_names'
// Reuse permission probes across list variants and the 3s migration poll.
const RECORD_WRITE_ACCESS_STALE_MS = 30_000

/** The dashboard queries that list the connected accounts' names. */
export const DASHBOARD_NAME_ACTIONS = [
  NAMES_ACTION,
  GRACE_NAMES_ACTION,
  RENEWABLE_NAMES_ACTION,
] as const

/** Refreshes every dashboard name list, inactive variants too when asked. */
export const invalidateDashboardNames = (
  queryClient: QueryClient,
  options: { readonly refetchType?: 'active' | 'all' } = {},
) =>
  Promise.all(
    DASHBOARD_NAME_ACTIONS.map(($action) =>
      queryClient.invalidateQueries({
        queryKey: qk('dashboard', $action),
        ...options,
      }),
    ),
  )

export class GetDashboardNamesError extends TaggedError(
  'GetDashboardNamesError',
)<{
  cause: BignameError | IndexerReadError
}> {}

/** `relation=any` drops an ENSv2 name once it expires, but it stays renewable through grace. */
const getGraceNames = (
  addressNames: BignameClient['addressNames'],
  address: Address,
  now: Date,
  signal: AbortSignal | undefined,
) =>
  readGraceNames(
    { addressNames },
    address,
    BigInt(Math.floor(now.getTime() / 1000)),
    signal,
  )
    .map((rows) => rows.flatMap((row) => toGraceName(row) ?? []))
    .mapErr((error) => new GetDashboardNamesError({ cause: error }))

export const DASHBOARD_PAGE_SIZE = 5
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
  /** Only ENSv1 or only ENSv2 names; `null` lists both. */
  readonly version: NameVersion | null
  /** The wallet that signs profile record writes, not the smart account. */
  readonly recordEditorAddress?: Address
}

/** Each address's cursor; an address not yet read has none, an exhausted one `null`. */
export type DashboardCursors = Readonly<Record<string, string | null>>

const readChunk = (
  readNames: ReadNamesForAddress,
  query: DashboardNamesQuery,
  address: Address,
  cursor: string | undefined,
  isVisible: ReadDashboardNameVisibility,
): ResultAsync<AddressNamesChunk, GetDashboardNamesError> =>
  readNamesPage(readNames, {
    address,
    sort: SORTS[query.sortField],
    order: query.sortDir,
    pageSize: DASHBOARD_CHUNK_SIZE,
    ...(query.search && { contains: query.search }),
    ...(query.version && { protocol: query.version }),
    ...(cursor === undefined ? { includeTotal: true } : { cursor }),
  })
    .andThen((page) => {
      const listed = page.items.filter(isListedName)
      const last = page.items.at(-1)
      return ResultAsync.combine(listed.map(isVisible)).map((visibility) => {
        const visible = listed.filter((_, index) => visibility[index])
        return {
          address,
          names: visible.map(toDashboardName),
          hiddenCount: page.items.length - visible.length,
          lastRead: last ? toDashboardName(last) : null,
          nextCursor: page.nextCursor,
          totalCount: page.totalCount,
        } satisfies AddressNamesChunk
      })
    })
    .orElse((error) =>
      // A search that is not a valid name fragment matches nothing.
      error.kind === 'rejected' && query.search
        ? okAsync<AddressNamesChunk, GetDashboardNamesError>({
            address,
            names: [],
            hiddenCount: 0,
            lastRead: null,
            nextCursor: null,
            totalCount: 0,
          })
        : errAsync(new GetDashboardNamesError({ cause: error })),
    )

// Reads on while a chunk lists less than a page, so every read releases at
// least a page of names and a page is short only once the names run out.
const readListedChunk = ResultFn(async function* (
  readNames: ReadNamesForAddress,
  query: DashboardNamesQuery,
  address: Address,
  cursor: string | undefined,
  isVisible: ReadDashboardNameVisibility,
) {
  let chunk = yield* readChunk(readNames, query, address, cursor, isVisible)
  while (
    chunk.names.length < DASHBOARD_PAGE_SIZE &&
    chunk.nextCursor !== null
  ) {
    const next: AddressNamesChunk = yield* readChunk(
      readNames,
      query,
      address,
      chunk.nextCursor,
      isVisible,
    )
    chunk = {
      ...next,
      names: [...chunk.names, ...next.names],
      hiddenCount: chunk.hiddenCount + next.hiddenCount,
      lastRead: next.lastRead ?? chunk.lastRead,
      totalCount: chunk.totalCount,
    }
  }
  return ok(chunk)
})

/** The next chunk of every address that has more, read side by side. */
export const readDashboardChunks = (
  readNames: ReadNamesForAddress,
  query: DashboardNamesQuery,
  cursors: DashboardCursors,
  isVisible: ReadDashboardNameVisibility = () => okAsync(true),
) =>
  ResultAsync.combine(
    query.addresses.flatMap((address) => {
      const cursor = cursors[address]
      return cursor === null
        ? []
        : [readListedChunk(readNames, query, address, cursor, isVisible)]
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
  queryClient: QueryClient,
) =>
  resultInfiniteQueryOptions({
    queryKey: qk('dashboard', NAMES_ACTION, {
      addresses: query.addresses.map((address) => address.toLowerCase()),
      sortField: query.sortField,
      sortDir: query.sortDir,
      search: query.search,
      version: query.version,
      recordEditorAddress: query.recordEditorAddress?.toLowerCase() ?? null,
    }),
    initialPageParam: START,
    queryFn: ({ pageParam }) =>
      readDashboardChunks(
        readNamesForAddress(bigname),
        query,
        pageParam,
        getDashboardNameVisibility((name) =>
          query.recordEditorAddress
            ? queryClient.fetchQuery({
                ...resolverWriteAccessQuery(name, query.recordEditorAddress),
                staleTime: RECORD_WRITE_ACCESS_STALE_MS,
              })
            : Promise.resolve(true),
        ),
      ),
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
  {
    now = new Date(),
    signal,
  }: Readonly<{ now?: Date; signal?: AbortSignal }> = {},
) =>
  ResultAsync.combine(
    addresses.map((address) =>
      getGraceNames(addressNames, address, now, signal),
    ),
  ).map((collections) => mergeDashboardNames(collections.flat()))

export const getDashboardGraceNamesQueryOptions = (
  addresses: readonly Address[],
) =>
  resultQueryOptions({
    queryKey: qk('dashboard', GRACE_NAMES_ACTION, {
      addresses: addresses.map((address) => address.toLowerCase()),
    }),
    queryFn:
      addresses.length > 0
        ? ({ signal }) =>
            getDashboardGraceNames(bigname.addressNames, addresses, { signal })
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
  signal?: AbortSignal,
) {
  const owned = yield* ResultAsync.combine(
    addresses.map((address) =>
      readAllNames(
        readNames,
        {
          address,
          relations: ['owner'],
          protocol: 'v2',
          parent: 'eth',
          ...(search && { contains: search }),
        },
        { signal },
      ),
    ),
  ).mapErr((error) => new GetDashboardNamesError({ cause: error }))
  const lapsed = yield* getDashboardGraceNames(addressNames, addresses, {
    signal,
  })
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
    queryKey: qk('dashboard', RENEWABLE_NAMES_ACTION, {
      addresses: addresses.map((address) => address.toLowerCase()),
      search,
    }),
    queryFn: ({ signal }) =>
      getRenewableDashboardNames(
        readNamesForAddress(bigname),
        bigname.addressNames,
        addresses,
        search,
        signal,
      ),
    meta: {
      dependsOn: ['indexer'],
    },
  })
