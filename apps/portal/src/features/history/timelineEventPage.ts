import {
  type HistoryEvent,
  type HistoryEventKind,
  type IndexerReadError,
  type Page,
  retryStaleRead,
} from '@ens-apps/indexer/reads'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { ok, okAsync, type Result, type ResultAsync } from 'neverthrow'
import type { Address } from 'viem'
import { indexer } from '@/lib/indexer'
import { normalizeOrLower } from '@/utils/ens/normalizeOrLower'
import { dropUnassignedRecords } from './assignedResolvers'
import { requireIndexed } from './requireIndexed'
import {
  type EventType,
  type TimelineEvent,
  toTimelineEvents,
} from './timelineEvent'

export class GetTimelineEventPageError extends TaggedError(
  'GetTimelineEventPageError',
)<{
  cause: IndexerReadError
}> {}

/** One page of a cursor-paginated event feed, whichever route produced it. */
export type TimelinePage = {
  readonly events: readonly TimelineEvent[]
  readonly endCursor: string | null
  readonly hasNextPage: boolean
  /** Rows matching the filter across every page; absent when the indexer does not count. */
  readonly totalCount: number | undefined
}

/**
 * Cursor plumbing shared by every paginated timeline feed.
 *
 * `initialPageParam` is annotated rather than left bare because TanStack infers
 * the page-param type from it; plain `undefined` would reject the cursor it is
 * threaded into. Falling back to `undefined` when `endCursor` is null stops a
 * page that claims `has_more` from refetching page one forever.
 */
export const timelinePageParams = {
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (last: TimelinePage) =>
    last.hasNextPage ? (last.endCursor ?? undefined) : undefined,
}

/**
 * Events per request. Halving it to 50 left time-to-first-row unchanged — first
 * paint is bound by round-trip latency, not this payload — so a smaller page
 * would only cost extra clicks.
 */
const HISTORY_TIMELINE_PAGE_SIZE = 100

/**
 * bigname answers `400` to `include=child_registrations` on these two: every
 * second-level registration is a child of one of them, which the option does
 * not offer as one parent's stream.
 */
const NO_CHILD_REGISTRATIONS = new Set(['eth', 'base.eth'])

const canIncludeChildRegistrations = (name: string) =>
  !NO_CHILD_REGISTRATIONS.has(normalizeOrLower(name))

type HistoryPage = Page<HistoryEvent>

const toPage = ({
  items,
  nextCursor,
  totalCount,
}: HistoryPage): TimelinePage => ({
  events: toTimelineEvents(items),
  endCursor: nextCursor,
  hasNextPage: nextCursor !== null,
  totalCount: totalCount ?? undefined,
})

/** One page read, sent again while the indexer answers stale. */
const wrap = (
  read: (signal?: AbortSignal) => ResultAsync<HistoryPage, IndexerReadError>,
  signal: AbortSignal | undefined,
) =>
  retryStaleRead(read, { signal })
    .map(toPage)
    .mapErr((cause) => new GetTimelineEventPageError({ cause }))

/** The indexer's largest history page. */
const MAX_PAGE_SIZE = 200

export type NameHistoryPageParameters = {
  readonly name: string
  /** A positive type set; omitted reads every type. */
  readonly types?: readonly EventType[]
  /** Raw kinds, intersecting `types`; omitted reads every kind. */
  readonly kinds?: readonly HistoryEventKind[]
  /** Inclusive unix-second bounds. */
  readonly from?: number
  readonly to?: number
  readonly order?: 'asc' | 'desc'
  readonly pageSize?: number
  readonly cursor?: string
  /** Merge the direct children's registrations into the stream (#939). */
  readonly includeChildRegistrations?: boolean
  readonly signal?: AbortSignal
}

const EMPTY_PAGE: TimelinePage = {
  events: [],
  endCursor: null,
  hasNextPage: false,
  totalCount: 0,
}

const EMPTY_HISTORY_PAGE: HistoryPage = {
  items: [],
  nextCursor: null,
  totalCount: 0,
}

export const fetchNameHistoryPage = ({
  name,
  types,
  kinds,
  from,
  to,
  order = 'desc',
  pageSize = HISTORY_TIMELINE_PAGE_SIZE,
  cursor,
  includeChildRegistrations = false,
  signal,
}: NameHistoryPageParameters) =>
  // A facet and a chip selection with nothing in common match nothing; bigname
  // answers an empty `type` set with `400`, so it is not asked.
  types?.length === 0
    ? okAsync<TimelinePage, GetTimelineEventPageError>(EMPTY_PAGE)
    : wrap(
        (requestSignal) =>
          indexer
            .getNameHistory(
              {
                name: normalizeOrLower(name),
                includeChildRegistrations:
                  includeChildRegistrations &&
                  canIncludeChildRegistrations(name),
                ...(types && { types }),
                ...(kinds && { kinds }),
                ...(from !== undefined && { from: new Date(from * 1000) }),
                ...(to !== undefined && { to: new Date(to * 1000) }),
                order,
                pageSize,
                ...(cursor && { cursor }),
              },
              { signal: requestSignal },
            )
            .andThen(
              // A name the indexer has not indexed, such as an offchain one, has no history.
              (page): Result<HistoryPage, IndexerReadError> =>
                page === null && !cursor
                  ? ok(EMPTY_HISTORY_PAGE)
                  : requireIndexed(name)(page),
            )
            .andThen((page) =>
              dropUnassignedRecords(page.items, requestSignal).map((items) => ({
                ...page,
                items,
              })),
            ),
        signal,
      )

/** Every registration a registry emits is of one of its labels: a subname. */
const asSubnames = (page: TimelinePage): TimelinePage => ({
  ...page,
  events: page.events.map((event) =>
    event.type === 'registration' ? { ...event, subject: 'child' } : event,
  ),
})

/**
 * Everything one contract emitted — how a registry's own feed is addressed.
 * `includeTotal` makes the indexer count a contract read exactly
 * (it does not by default), so the feed carries its own total.
 */
export const fetchContractEventsPage = ({
  contractAddress,
  cursor,
  signal,
}: {
  readonly contractAddress: Address
  readonly cursor?: string
  readonly signal?: AbortSignal
}) =>
  wrap(
    (requestSignal) =>
      indexer.getEvents(
        {
          contractAddress: contractAddress.toLowerCase() as Address,
          includeTotal: true,
          order: 'desc',
          pageSize: HISTORY_TIMELINE_PAGE_SIZE,
          ...(cursor && { cursor }),
        },
        { signal: requestSignal },
      ),
    signal,
  ).map(asSubnames)

/**
 * A resolver's feed as its overview reads it: what it emitted plus the names
 * pointed at it or away from it.
 */
export const fetchResolverEventsPage = ({
  resolverAddress,
  cursor,
  signal,
}: {
  readonly resolverAddress: Address
  readonly cursor?: string
  readonly signal?: AbortSignal
}) =>
  wrap(
    (requestSignal) =>
      indexer.getEvents(
        {
          resolver: resolverAddress,
          includeTotal: true,
          order: 'desc',
          pageSize: MAX_PAGE_SIZE,
          ...(cursor && { cursor }),
        },
        { signal: requestSignal },
      ),
    signal,
  )
