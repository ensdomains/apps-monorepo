import {
  type BignameError,
  type EventDataByType,
  type EventRow,
  type EventType,
  toUnixSeconds,
} from '@ens-apps/indexer/bigname'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultInfiniteQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { Address, Hash } from 'viem'
import { dropUnassignedRecords } from '@/features/history/assignedResolvers'
import { bigname } from '@/lib/bigname'
import { mergeRegistrationTwins } from '@/utils/history/registrationTwins'

/** The row's friendly type with its typed `include=data` payload. */
type RecentActivityPayload = {
  readonly [TType in EventType]: {
    readonly type: TType
    /** Raw storage kind (`include=raw`), e.g. `RecordVersionChanged`. */
    readonly kind?: string
    /** Absent when bigname leaves the payload out. */
    readonly data?: EventDataByType[TType]
  }
}[EventType]

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
  cause: BignameError
}> {}

const RECENT_ACTIVITY_PAGE_SIZE = 15

/**
 * An authority epoch with no new owner (bigname writes them beside
 * registrations and wraps) says nothing a reader can act on.
 */
const isOwnerlessAuthority = (row: EventRow): boolean =>
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
  row: EventRow,
  primaryNameTxs: ReadonlySet<string>,
): boolean =>
  row.type === 'record' &&
  row.data?.key === 'name' &&
  !!row.transaction_hash &&
  primaryNameTxs.has(row.transaction_hash)

const toActivityEvent = (
  row: EventRow,
  primaryNameTxs: ReadonlySet<string>,
): RecentActivityEvent[] => {
  const timestamp = toUnixSeconds(row.timestamp)
  // A state-derived row has no transaction to link, nor a place in the feed.
  if (!row.transaction_hash || row.block_number === null || !timestamp)
    return []
  if (isOwnerlessAuthority(row) || isEchoedNameRecord(row, primaryNameTxs))
    return []
  // A record write bigname could not attribute to a name carries none.
  const name = row.name || null
  // A row is its payload plus fields read here, so it stands in for one.
  const payload: RecentActivityPayload = row
  return [
    {
      ...payload,
      name,
      transactionHash: row.transaction_hash,
      timestamp,
      blockNumber: row.block_number,
      contractAddress: row.contract_address ?? null,
    },
  ]
}

const toActivityEvents = (rows: readonly EventRow[]): RecentActivityEvent[] => {
  const primaryNameTxs = new Set(
    rows.flatMap((row) =>
      row.type === 'primary_name' && row.transaction_hash
        ? [row.transaction_hash]
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
const getRecentActivityPage = (cursor: string | undefined) =>
  bigname
    .events({
      order: 'desc',
      page_size: RECENT_ACTIVITY_PAGE_SIZE,
      include: ['data', 'raw'],
      ...(cursor && { cursor }),
    })
    .andThen(({ data, page }) =>
      dropUnassignedRecords(data).map((rows) => ({ data: rows, page })),
    )
    .map(
      ({ data, page }): RecentActivityPage => ({
        // A twin whose partner is on the next page stays, as in the timeline.
        events: toActivityEvents(data),
        endCursor: page?.next_cursor ?? null,
        hasNextPage: page?.has_more ?? false,
      }),
    )
    .mapErr((cause) => new GetRecentActivityError({ cause }))

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
