import type { BignameError } from '@ens-apps/indexer/bigname'
import {
  type EventRow,
  isStale,
  readNamesForAddress,
  retryStale,
  toUnixSeconds,
} from '@ens-apps/indexer/bigname'
import type { IndexerReadError } from '@ens-apps/indexer/reads'
import { readAllNames } from '@ens-apps/indexer/reads'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import {
  resultInfiniteQueryOptions,
  resultQueryOptions,
} from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { ResultAsync } from 'neverthrow'
import type { Address } from 'viem'
import { bigname } from '@/lib/bigname'
import {
  flattenHistoryData,
  historyEventLogId,
} from '@/utils/history/historyEventsToSubgraphEvents'
import { mergeRegistrationTwins } from '@/utils/history/registrationTwins'
import type {
  AddressHistoryEvent,
  AddressNameHistory,
} from '@/utils/history/transformAddressHistory'

class GetAddressHistoryError extends TaggedError('GetAddressHistoryError')<{
  cause: BignameError | IndexerReadError
}> {}

type GetAddressHistoryParameters = {
  readonly address: Address
  /** Rows the recent-history teaser reads: its first page only. */
  readonly pageSize: number
}

const toError = (cause: BignameError | IndexerReadError) =>
  new GetAddressHistoryError({ cause })

const readHistoryPage = (address: Address, pageSize: number, cursor?: string) =>
  bigname.addressHistory(address.toLowerCase(), {
    relation: 'any',
    include: ['data', 'raw'],
    order: 'desc',
    page_size: pageSize,
    ...(cursor && { cursor }),
  })

/**
 * The names the address holds the token of, from a `relation=owner` names read:
 * `owner` is the token holder (BaseRegistrar, NameWrapper or ENSv2 token; the
 * registry owner only for a tokenless subname, which `attributeName` never
 * treats as a root). A `manager` relation alone is the registry controller,
 * which any parent owner can assign, so it does not count.
 */
const readHeldNames = (address: Address, signal: AbortSignal | undefined) =>
  readAllNames(
    readNamesForAddress(bigname),
    { address, relations: ['owner'] },
    { signal },
  )
    .map((names) => new Set(names.map(({ name }) => name)))
    .mapErr(toError)

const toEvent = (row: EventRow): AddressHistoryEvent[] => {
  const timestamp = toUnixSeconds(row.timestamp)
  // A state-derived row has no transaction for the table to group under.
  if (!row.transaction_hash || row.block_number === null || !timestamp)
    return []
  return [
    {
      id: historyEventLogId(row),
      transactionHash: row.transaction_hash,
      blockNumber: row.block_number,
      name: row.name ?? '',
      type: row.kind ?? row.type,
      timestamp,
      data: flattenHistoryData(row.data),
    },
  ]
}

/**
 * An address's history rows grouped by name, ENSv1 and ENSv2 alike.
 *
 * Grouped rather than flat because whether a name's history is the address's
 * own is decided per name (see `nameAttribution.ts`), and that needs each
 * name's provenance: `registrarHolder` is the address when it holds the name's
 * token, read from the names list since history rows carry no relations.
 */
export const toAddressNameHistory = (
  address: Address,
  rows: readonly EventRow[],
  heldNames: ReadonlySet<string>,
): AddressNameHistory[] => {
  const byName = new Map<string, AddressHistoryEvent[]>()
  // One row per registration, so its charge is stated once.
  for (const row of mergeRegistrationTwins(rows)) {
    const events = toEvent(row)
    if (events.length === 0) continue
    const key = row.name ?? ''
    byName.set(key, [...(byName.get(key) ?? []), ...events])
  }
  return [...byName].map(([name, events]) => ({
    // A record write bigname could not attribute to a name has none.
    name: name || null,
    registrarHolder: name && heldNames.has(name) ? address : null,
    events,
  }))
}

const getAddressHistoryQueryKey = createQueryKey<
  'get-address-history',
  GetAddressHistoryParameters
>('get-address-history')

/** The newest `pageSize` rows of an address's history, for the overview teaser. */
export const getAddressHistoryQueryOptions = (
  params: GetAddressHistoryParameters,
) =>
  resultQueryOptions({
    queryKey: getAddressHistoryQueryKey(params),
    queryFn: ({ queryKey: [, { address, pageSize }], signal }) =>
      ResultAsync.combine([
        readHistoryPage(address, pageSize).mapErr(toError),
        readHeldNames(address, signal),
      ]).map(([{ data }, heldNames]) => ({
        history: toAddressNameHistory(address, data, heldNames),
        heldNames,
      })),
  })

const txOf = (row: EventRow): string | null =>
  row.transaction_hash?.toLowerCase() ?? null

/**
 * How many of `rows` (newest first) to show for a window of `window`, so no
 * transaction is split: a cut inside one takes the rest of it, and the last
 * loaded one, which may continue on the next page while `hasMore`, waits for
 * it. A registration's twin rows sit in one transaction, so they stay together.
 */
export const countWholeTransactions = (
  rows: readonly EventRow[],
  window: number,
  hasMore: boolean,
): number => {
  let end = Math.min(window, rows.length)
  const last = end > 0 ? txOf(rows[end - 1]) : null
  if (last !== null)
    while (end < rows.length && txOf(rows[end]) === last) end += 1
  if (end < rows.length || !hasMore || last === null) return end
  let start = end
  while (start > 0 && txOf(rows[start - 1]) === last) start -= 1
  // One transaction larger than the whole read is shown as it is.
  return start > 0 ? start : end
}

export const ADDRESS_HISTORY_PAGE_SIZE = 100

export type AddressHistoryPage = {
  readonly rows: readonly EventRow[]
  readonly nextCursor: string | null
}

const getAddressHistoryPagesQueryKey = createQueryKey<
  'get-address-history-pages',
  { readonly address: Address }
>('get-address-history-pages')

/** One bigname stream over every name the address owns, manages or holds a role on, a page at a time. */
export const getAddressHistoryPagesQueryOptions = (params: {
  readonly address: Address
}) =>
  resultInfiniteQueryOptions({
    queryKey: getAddressHistoryPagesQueryKey(params),
    queryFn: ({ queryKey: [, { address }], pageParam }) =>
      retryStale(
        () => readHistoryPage(address, ADDRESS_HISTORY_PAGE_SIZE, pageParam),
        isStale,
      )
        .map(
          ({ data, page }): AddressHistoryPage => ({
            rows: data,
            nextCursor: page?.has_more ? (page.next_cursor ?? null) : null,
          }),
        )
        .mapErr(toError),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: AddressHistoryPage) =>
      last.nextCursor ?? undefined,
  })

const getAddressHeldNamesQueryKey = createQueryKey<
  'get-address-held-names',
  { readonly address: Address }
>('get-address-held-names')

export const getAddressHeldNamesQueryOptions = (params: {
  readonly address: Address
}) =>
  resultQueryOptions({
    queryKey: getAddressHeldNamesQueryKey(params),
    queryFn: ({ queryKey: [, { address }], signal }) =>
      readHeldNames(address, signal),
  })
