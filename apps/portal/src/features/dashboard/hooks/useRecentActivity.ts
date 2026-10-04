import {
  type BignameError,
  type EventRow,
  type HistoryEventDataByType,
  type HistoryEventType,
  timestampToSeconds,
} from '@ens-apps/bigname'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultInfiniteQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise } from 'neverthrow'
import type { Hash } from 'viem'
import { namehash } from 'viem/ens'
import { bigname } from '@/lib/bigname'

/** The row's friendly type with its typed `include=data` payload. */
type RecentActivityPayload = {
  readonly [TType in HistoryEventType]: {
    readonly type: TType
    /** Raw storage kind (`include=raw`), e.g. `RecordVersionChanged`. */
    readonly kind?: string
    readonly data: HistoryEventDataByType[TType]
  }
}[HistoryEventType]

export type RecentActivityEvent = RecentActivityPayload & {
  readonly name: string | null
  readonly transactionHash: Hash
  readonly timestamp: number
  readonly blockNumber: number
  readonly contractAddress: string
  readonly namehash: string | null
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

const toActivityEvent = (row: EventRow): RecentActivityEvent[] => {
  const timestamp = timestampToSeconds(row.timestamp)
  // A state-derived row has no transaction to link, nor a place in the feed.
  if (!row.transaction_hash || row.block_number === null || !timestamp)
    return []
  // A record write bigname could not attribute to a name carries none.
  const name = row.name || null
  return [
    {
      ...({
        type: row.type,
        kind: row.kind,
        data: row.data ?? {},
      } as RecentActivityPayload),
      name,
      transactionHash: row.transaction_hash,
      timestamp,
      blockNumber: row.block_number,
      contractAddress: row.contract_address ?? '',
      namehash: name ? safeNamehash(name) : null,
    },
  ]
}

const safeNamehash = (name: string): string | null => {
  try {
    return namehash(name)
  } catch {
    return null
  }
}

/**
 * The newest events across the namespace, ENSv1 and ENSv2 alike. No `type`
 * filter: the old feed only excluded `CommitmentMade`, which bigname does not
 * serve as a history row, so every friendly type belongs here.
 */
const getRecentActivityPage = (cursor: string | undefined) =>
  fromPromise(
    bigname.listEvents({
      order: 'desc',
      page_size: RECENT_ACTIVITY_PAGE_SIZE,
      include: ['data', 'raw'],
      cursor,
    }),
    (e) => new GetRecentActivityError({ cause: e as BignameError }),
  ).map(
    ({ data, page }): RecentActivityPage => ({
      events: data.flatMap(toActivityEvent),
      endCursor: page.next_cursor,
      hasNextPage: page.has_more,
    }),
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
