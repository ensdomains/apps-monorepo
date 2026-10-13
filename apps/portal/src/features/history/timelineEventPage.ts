import {
  type BignameError,
  type Envelope,
  type EventRow,
  type EventType,
  isStale,
  MAX_PAGE_SIZE,
  type NameHistoryRow,
  retryStale,
  secondsToTimestamp,
} from '@ens-apps/indexer/bigname'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { okAsync, type ResultAsync } from 'neverthrow'
import type { Address } from 'viem'
import { envConfig } from '@/config'
import { bigname } from '@/lib/bigname'
import { normalizeOrLower } from '@/utils/ens/normalizeOrLower'
import { type TimelineEvent, toTimelineEvents } from './timelineEvent'

export class GetTimelineEventPageError extends TaggedError(
  'GetTimelineEventPageError',
)<{
  cause: BignameError
}> {}

/** One page of a cursor-paginated event feed, whichever route produced it. */
export type TimelinePage = {
  readonly events: readonly TimelineEvent[]
  readonly endCursor: string | null
  readonly hasNextPage: boolean
  /** Rows matching the filter across every page; absent when bigname does not count. */
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

type HistoryPage =
  | Envelope<readonly NameHistoryRow[]>
  | Envelope<readonly EventRow[]>

const toPage = ({ data, page }: HistoryPage): TimelinePage => ({
  events: toTimelineEvents(data),
  endCursor: page?.next_cursor ?? null,
  hasNextPage: page?.has_more ?? false,
  totalCount: page?.total_count ?? undefined,
})

/** One page read, sent again while bigname answers stale. */
const wrap = (
  read: (signal?: AbortSignal) => ResultAsync<HistoryPage, BignameError>,
  signal: AbortSignal | undefined,
) =>
  retryStale(read, isStale, { signal })
    .map(toPage)
    .mapErr((cause) => new GetTimelineEventPageError({ cause }))

export type NameHistoryPageParameters = {
  readonly name: string
  /** A positive type set; omitted reads every type. */
  readonly types?: readonly EventType[]
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

export const fetchNameHistoryPage = ({
  name,
  types,
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
          bigname.nameHistory(
            normalizeOrLower(name),
            {
              include:
                includeChildRegistrations && canIncludeChildRegistrations(name)
                  ? ['data', 'raw', 'child_registrations']
                  : ['data', 'raw'],
              ...(types && { type: types }),
              ...(from !== undefined && {
                from_timestamp: secondsToTimestamp(from),
              }),
              ...(to !== undefined && { to_timestamp: secondsToTimestamp(to) }),
              order,
              page_size: pageSize,
              ...(cursor && { cursor }),
            },
            { signal: requestSignal },
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
 * `include=total_count` makes bigname count a `contract_address` read exactly
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
      bigname.events(
        {
          contract_address: contractAddress.toLowerCase() as Address,
          include: ['data', 'raw', 'total_count'],
          order: 'desc',
          page_size: HISTORY_TIMELINE_PAGE_SIZE,
          ...(cursor && { cursor }),
        },
        { signal: requestSignal },
      ),
    signal,
  ).map(asSubnames)

/**
 * A resolver's feed as its overview reads it: what it emitted plus the names
 * pointed at it or away from it. Read 200 at a time: bigname times out on this
 * filter at 50 and 100.
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
      bigname.events(
        {
          resolver: `${envConfig.chain.id}:${resolverAddress.toLowerCase()}`,
          include: ['data', 'raw', 'total_count'],
          order: 'desc',
          page_size: MAX_PAGE_SIZE,
          ...(cursor && { cursor }),
        },
        { signal: requestSignal },
      ),
    signal,
  )
