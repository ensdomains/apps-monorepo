import type {
  HistoryEvent,
  HistoryEventData,
  HistoryEventType,
  IndexerReadError,
} from '@ens-apps/indexer/reads'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultInfiniteQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { okAsync, type ResultAsync } from 'neverthrow'
import type { Address, Hash } from 'viem'
import { dropUnassignedRecords } from '@/features/history/assignedResolvers'
import { indexer } from '@/lib/indexer'
import { mergeRegistrationTwins } from '@/utils/history/registrationTwins'

/** The row's friendly type with its typed `include=data` payload. */
type RecentActivityPayload = {
  readonly [TType in HistoryEventType]: {
    readonly type: TType
    /** Raw storage kind, e.g. `RecordVersionChanged`. */
    readonly kind?: string
    /** Absent when the indexer leaves the payload out. */
    readonly data?: HistoryEventData[TType]
  }
}[HistoryEventType]

export type RecentActivityEvent = RecentActivityPayload & {
  readonly name: string | null
  readonly transactionHash: Hash
  readonly timestamp: number
  readonly blockNumber: number
  readonly contractAddress: Address | null
}

/** One page of the protocol-wide feed. */
export type RecentActivityPage = {
  readonly events: readonly RecentActivityEvent[]
  readonly endCursor: string | null
  readonly hasNextPage: boolean
}

class GetRecentActivityError extends TaggedError('GetRecentActivityError')<{
  cause: IndexerReadError
}> {}

const RECENT_ACTIVITY_PAGE_SIZE = 15

/**
 * An authority epoch with no new owner (bigname writes them beside
 * registrations and wraps) says nothing a reader can act on.
 */
const isOwnerlessAuthority = (row: HistoryEvent): boolean =>
  row.type === 'authority' &&
  !row.data?.owner &&
  row.data?.action !== 'name_wrapped' &&
  row.data?.action !== 'name_unwrapped'

/**
 * A `name` record write beside a `primary_name` row in the same transaction,
 * which already says it. A `name` write without one (set directly on the
 * reverse resolver, or on a forward name) stays.
 */
const isEchoedNameRecord = (
  row: HistoryEvent,
  primaryNameTxs: ReadonlySet<string>,
): boolean =>
  row.type === 'record' &&
  row.data?.key === 'name' &&
  !!row.transactionHash &&
  primaryNameTxs.has(row.transactionHash)

const toActivityEvent = (
  row: HistoryEvent,
  primaryNameTxs: ReadonlySet<string>,
): RecentActivityEvent[] => {
  const timestamp = row.timestamp && Math.floor(row.timestamp.getTime() / 1000)
  // A state-derived row has no transaction to link, nor a place in the feed.
  if (!row.transactionHash || row.blockNumber === null || !timestamp) return []
  if (isOwnerlessAuthority(row) || isEchoedNameRecord(row, primaryNameTxs))
    return []
  // A record write the indexer could not attribute to a name carries none.
  const name = row.name || null
  // A row is its payload plus fields read here, so it stands in for one.
  const payload: RecentActivityPayload = { ...row, kind: row.kind ?? undefined }
  return [
    {
      ...payload,
      name,
      transactionHash: row.transactionHash,
      timestamp,
      blockNumber: row.blockNumber,
      contractAddress: row.contractAddress,
    },
  ]
}

const toActivityEvents = (
  rows: readonly HistoryEvent[],
): RecentActivityEvent[] => {
  const primaryNameTxs = new Set(
    rows.flatMap((row) =>
      row.type === 'primary_name' && row.transactionHash
        ? [row.transactionHash]
        : [],
    ),
  )
  return mergeRegistrationTwins(rows).flatMap((row) =>
    toActivityEvent(row, primaryNameTxs),
  )
}

/**
 * The newest events across the namespace, ENSv1 and ENSv2 alike. No `type`
 * filter: the old feed only excluded `CommitmentMade`, which bigname does not
 * serve as a history row, so every friendly type belongs here.
 */
const readActivityPage = (cursor: string | undefined) =>
  indexer
    .getEvents({
      order: 'desc',
      pageSize: RECENT_ACTIVITY_PAGE_SIZE,
      ...(cursor && { cursor }),
    })
    .andThen(({ items, nextCursor }) =>
      dropUnassignedRecords(items).map((rows) => ({ items: rows, nextCursor })),
    )
    .map(
      ({ items, nextCursor }): RecentActivityPage => ({
        // A twin whose partner is on the next page stays, as in the timeline.
        events: toActivityEvents(items),
        endCursor: nextCursor,
        hasNextPage: nextCursor !== null,
      }),
    )
    .mapErr((cause) => new GetRecentActivityError({ cause }))

// How many pages of only hidden rows a read skips; lapsing names on mainnet fill whole pages with them.
const MAX_HIDDEN_PAGES = 5

/** The next page with a row to show, reading past pages of only hidden rows. */
const getRecentActivityPage = (
  cursor: string | undefined,
  hiddenPagesLeft = MAX_HIDDEN_PAGES,
): ResultAsync<RecentActivityPage, GetRecentActivityError> =>
  readActivityPage(cursor).andThen((page) =>
    page.events.length === 0 && page.hasNextPage && hiddenPagesLeft > 0
      ? getRecentActivityPage(page.endCursor ?? undefined, hiddenPagesLeft - 1)
      : okAsync(page),
  )

const getRecentActivityQueryKey = createQueryKey<
  'get-recent-activity',
  Record<never, never>
>('get-recent-activity')

export const getRecentActivityQueryOptions = () =>
  resultInfiniteQueryOptions({
    queryKey: getRecentActivityQueryKey({}),
    queryFn: ({ pageParam }) => getRecentActivityPage(pageParam),
    initialPageParam: undefined as string | undefined,
    // A null `next_cursor` must stop paging, or page one refetches forever.
    getNextPageParam: (last: RecentActivityPage) =>
      last.hasNextPage ? (last.endCursor ?? undefined) : undefined,
    // Polling refetches every loaded page, so it stops once the reader pages on.
    refetchInterval: (query) =>
      (query.state.data?.pages.length ?? 0) > 1 ? false : 30_000,
    staleTime: 15_000,
  })
