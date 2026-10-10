import { readNamesForAddress } from '@ens-apps/indexer/bigname'
import type {
  IndexerReadError,
  NameRelation,
  NamesForAddressQuery,
  ReadNamesForAddress,
} from '@ens-apps/indexer/reads'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import {
  resultInfiniteQueryOptions,
  resultQueryOptions,
} from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import { errAsync, ok, okAsync, ResultAsync } from 'neverthrow'
import type { Address } from 'viem'
import type { SortDir, SortField } from '@/features/dashboard/mergedNames'
import { readNamesPage } from '@/features/shared/service/readNamePages'
import { bigname } from '@/lib/bigname'
import {
  type ProfileAddressName,
  toProfileAddressName,
} from './buildProfileAddressNames'

export const PROFILE_NAMES_PAGE_SIZE = 5
// Rows per read: a page of the list is five, so this covers several pages.
export const PROFILE_NAMES_CHUNK_SIZE = 50

export class GetProfileAddressNamesError extends TaggedError(
  'GetProfileAddressNamesError',
)<{
  cause: IndexerReadError
}> {}

/** `all` on someone else's profile; your own splits names you own from names you only manage. */
export type ProfileNamesScope = 'all' | 'owned' | 'managed'

const SCOPE_RELATIONS: Readonly<
  Record<ProfileNamesScope, readonly NameRelation[] | undefined>
> = {
  all: undefined,
  owned: ['owner'],
  managed: ['manager', 'role_holder'],
}

const SORTS: Readonly<Record<SortField, NamesForAddressQuery['sort']>> = {
  name: 'name',
  expiry: 'expiry',
  created: 'created',
}

export type ProfileNamesQuery = {
  readonly address: Address
  readonly scope: ProfileNamesScope
  readonly sortField: SortField
  readonly sortDir: SortDir
  /** A fragment the names contain; empty lists everything. */
  readonly search: string
}

/** One read of the address's names, in bigname's order. */
export type ProfileNamesChunk = {
  readonly names: readonly ProfileAddressName[]
  /** Rows bigname listed that this list hides, such as reverse records. */
  readonly hiddenCount: number
  readonly nextCursor: string | null
  readonly totalCount: number | null
}

// The managed list is names the address manages but does not own.
const isInScope = (scope: ProfileNamesScope, name: ProfileAddressName) =>
  scope !== 'managed' || name.roleCategory === 'managed'

const EMPTY_CHUNK: ProfileNamesChunk = {
  names: [],
  hiddenCount: 0,
  nextCursor: null,
  totalCount: 0,
}

const readChunk = (
  readNames: ReadNamesForAddress,
  query: ProfileNamesQuery,
  cursor: string | undefined,
): ResultAsync<ProfileNamesChunk, GetProfileAddressNamesError> =>
  readNamesPage(readNames, {
    address: query.address,
    relations: SCOPE_RELATIONS[query.scope],
    sort: SORTS[query.sortField],
    order: query.sortDir,
    pageSize: PROFILE_NAMES_CHUNK_SIZE,
    ...(query.search && { contains: query.search }),
    ...(cursor === undefined ? { includeTotal: true } : { cursor }),
  })
    .map((page): ProfileNamesChunk => {
      const names = page.items
        .flatMap((item) => toProfileAddressName(item) ?? [])
        .filter((name) => isInScope(query.scope, name))
      return {
        names,
        hiddenCount: page.items.length - names.length,
        nextCursor: page.nextCursor,
        totalCount: page.totalCount,
      }
    })
    .orElse((error) =>
      // A search that is not a valid name fragment matches nothing.
      error.kind === 'rejected' && query.search
        ? okAsync<ProfileNamesChunk, GetProfileAddressNamesError>(EMPTY_CHUNK)
        : errAsync(new GetProfileAddressNamesError({ cause: error })),
    )

/**
 * Reads on while the chunk lists less than a page, so a page is short only
 * once the names run out. The managed list can hide most of a chunk.
 */
export const readProfileNamesChunk = ResultFn(async function* (
  readNames: ReadNamesForAddress,
  query: ProfileNamesQuery,
  cursor: string | undefined,
) {
  let chunk = yield* readChunk(readNames, query, cursor)
  while (
    chunk.names.length < PROFILE_NAMES_PAGE_SIZE &&
    chunk.nextCursor !== null
  ) {
    const next: ProfileNamesChunk = yield* readChunk(
      readNames,
      query,
      chunk.nextCursor,
    )
    chunk = {
      ...next,
      names: [...chunk.names, ...next.names],
      hiddenCount: chunk.hiddenCount + next.hiddenCount,
      totalCount: chunk.totalCount,
    }
  }
  return ok(chunk)
})

export const profileNamesInfiniteQueryOptions = (query: ProfileNamesQuery) =>
  resultInfiniteQueryOptions({
    queryKey: qk('profile', 'address_names', {
      address: query.address.toLowerCase(),
      scope: query.scope,
      sortField: query.sortField,
      sortDir: query.sortDir,
      search: query.search,
    }),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      readProfileNamesChunk(readNamesForAddress(bigname), query, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    meta: {
      dependsOn: ['indexer'],
    },
  })

export type ProfileNameCounts = {
  readonly owned: number
  /** Names the address manages without owning them. */
  readonly managed: number
}

const readTotal = (
  readNames: ReadNamesForAddress,
  address: Address,
  relations: readonly NameRelation[] | undefined,
) =>
  readNamesPage(readNames, {
    address,
    relations,
    pageSize: 1,
    includeTotal: true,
  }).map(({ totalCount }) => totalCount)

/**
 * bigname's totals for the owned and managed lists. Managed is every
 * authority relation less the owned ones, so a reverse record cancels out;
 * owned still counts one until the list reads it.
 */
export const getProfileNameCounts = (
  readNames: ReadNamesForAddress,
  address: Address,
) =>
  ResultAsync.combine([
    readTotal(readNames, address, ['owner']),
    readTotal(readNames, address, undefined),
  ])
    .map(([owned, all]): ProfileNameCounts | null =>
      owned === null || all === null
        ? null
        : { owned, managed: Math.max(0, all - owned) },
    )
    .mapErr((error) => new GetProfileAddressNamesError({ cause: error }))

export const profileNameCountsQueryOptions = (address: Address | undefined) =>
  resultQueryOptions({
    queryKey: qk('profile', 'address_name_counts', {
      address: address?.toLowerCase() ?? null,
    }),
    queryFn: address
      ? () => getProfileNameCounts(readNamesForAddress(bigname), address)
      : skipToken,
    meta: {
      dependsOn: ['indexer'],
    },
  })

export type ProfileNamesPage = {
  readonly names: readonly ProfileAddressName[]
  /** Exact once every chunk is read; until then bigname's total less what was hidden. */
  readonly total: number
  readonly isComplete: boolean
  /** How many listed names the requested page needs. */
  readonly needed: number
}

/**
 * The names a one-based page shows. The page is clamped to the last one: the
 * total can shrink as hidden rows are read, so the pager may offer a page
 * that no longer exists.
 */
export const toProfileNamesPage = (
  chunks: readonly ProfileNamesChunk[],
  page: number,
  pageSize: number,
): ProfileNamesPage => {
  const names = chunks.flatMap((chunk) => chunk.names)
  const hiddenCount = chunks.reduce((sum, chunk) => sum + chunk.hiddenCount, 0)
  const isComplete = chunks.at(-1)?.nextCursor === null
  const total = isComplete
    ? names.length
    : (chunks[0]?.totalCount ?? names.length + hiddenCount) - hiddenCount
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  const needed = Math.min(page, lastPage) * pageSize
  return {
    names: names.slice(needed - pageSize, needed),
    total,
    isComplete,
    needed,
  }
}

export type { ProfileAddressName }
