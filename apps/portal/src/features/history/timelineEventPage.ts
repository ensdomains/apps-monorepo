import {
  type BignameError,
  type BignamePage,
  type HistoryEvent,
  type HistoryEventType,
  secondsToTimestamp,
} from '@ens-apps/bigname'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { fromPromise, okAsync } from 'neverthrow'
import type { Address } from 'viem'
import { bigname } from '@/lib/bigname'
import { normalizeOrLower } from '@/utils/ens/normalizeOrLower'
import { type TimelineEvent, toTimelineEvents } from './timelineEvent'

class GetTimelineEventPageError extends TaggedError(
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

const toPage = (response: BignamePage<HistoryEvent>): TimelinePage => ({
  events: toTimelineEvents(response.data),
  endCursor: response.page.next_cursor,
  hasNextPage: response.page.has_more,
  totalCount: response.page.total_count ?? undefined,
})

const wrap = (promise: Promise<BignamePage<HistoryEvent>>) =>
  fromPromise(
    promise,
    (e) => new GetTimelineEventPageError({ cause: e as BignameError }),
  ).map(toPage)

export type NameHistoryPageParameters = {
  readonly name: string
  /** A positive type set; omitted reads every type. */
  readonly types?: readonly HistoryEventType[]
  /** Inclusive unix-second bounds. */
  readonly from?: number
  readonly to?: number
  readonly order?: 'asc' | 'desc'
  readonly pageSize?: number
  readonly cursor?: string
  /** Merge the direct children's registrations into the stream (#939). */
  readonly includeChildRegistrations?: boolean
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
}: NameHistoryPageParameters) =>
  // A facet and a chip selection with nothing in common match nothing; bigname
  // answers an empty `type` set with `400`, so it is not asked.
  types?.length === 0
    ? okAsync<TimelinePage, GetTimelineEventPageError>(EMPTY_PAGE)
    : wrap(
        bigname.getNameHistory(normalizeOrLower(name), {
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
          cursor,
        }),
      )

/**
 * Everything one contract emitted — how a registry's own feed is addressed.
 * `total_count` is always null for a `contract_address` read; the registry
 * overview's `counts.events` is the total.
 */
export const fetchContractEventsPage = ({
  contractAddress,
  cursor,
}: {
  readonly contractAddress: Address
  readonly cursor?: string
}) =>
  wrap(
    bigname.listEvents({
      contract_address: contractAddress.toLowerCase(),
      include: ['data', 'raw'],
      order: 'desc',
      page_size: HISTORY_TIMELINE_PAGE_SIZE,
      cursor,
    }),
  )
