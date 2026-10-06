import {
  type BignameError,
  fetchAllPages,
  type HistoryEvent,
  MAX_PAGE_SIZE,
  timestampToSeconds,
} from '@ens-apps/bigname'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise } from 'neverthrow'
import { bigname } from '@/lib/bigname'
import { normalizeOrLower } from '@/utils/ens/normalizeOrLower'
import { recordValueText } from '@/utils/history/recordValue'

class GetRecordHistoryError extends TaggedError('GetRecordHistoryError')<{
  cause: BignameError
}> {}

/** Every record of one family. */
type RecordHistoryFamily = 'coins' | 'texts' | 'contentHash' | 'abi'

export type RecordHistoryParameters = {
  readonly name: string
  /**
   * A record family, or one stored record key as bigname spells it
   * (`addr:60`, `text:email`, `contenthash`).
   */
  readonly key: RecordHistoryFamily | (string & {})
}

/**
 * One record write, in the shape the events table groups by transaction (see
 * `groupEventsByTransactionId`). `id` is `{txHash}-{logIndex}`, which is how the
 * table finds the write's log in the receipt.
 */
export type RecordHistoryEvent = {
  readonly id: string
  readonly transactionID: string
  readonly blockNumber: number
  readonly timestamp: bigint
  /** The raw storage kind, e.g. `RecordChanged`, `RecordVersionChanged`. */
  readonly type: string
  readonly key?: string
  /** Text values as written, other families as hex; absent when not retained. */
  readonly value?: string
  readonly coinType?: number
}

const FAMILY_MATCHERS: Record<RecordHistoryFamily, (key: string) => boolean> = {
  coins: (key) => key.startsWith('addr:'),
  texts: (key) => key.startsWith('text:') || key === 'avatar',
  contentHash: (key) => key === 'contenthash',
  abi: (key) => key.startsWith('abi'),
}

const isFamily = (key: string): key is RecordHistoryFamily =>
  key in FAMILY_MATCHERS

/**
 * Whether a `record` row belongs to the requested history. A record-version
 * reset (`clearRecords`) carries no key and clears every record, so it belongs
 * to all of them.
 */
const matchesKey = (
  row: HistoryEvent,
  wanted: RecordHistoryParameters['key'],
): boolean => {
  if (row.type !== 'record') return false
  if (row.kind === 'RecordVersionChanged') return true
  const key = row.data?.key
  if (!key) return false
  return isFamily(wanted) ? FAMILY_MATCHERS[wanted](key) : key === wanted
}

const toRecordHistoryEvent = (row: HistoryEvent): RecordHistoryEvent[] => {
  const timestamp = timestampToSeconds(row.timestamp)
  if (
    row.type !== 'record' ||
    !row.transaction_hash ||
    row.block_number === null ||
    timestamp === undefined
  )
    return []
  const value = recordValueText(row.data?.value)
  return [
    {
      id: `${row.transaction_hash}-${String(row.log_index ?? '')}`,
      transactionID: row.transaction_hash,
      blockNumber: row.block_number,
      timestamp: BigInt(timestamp),
      type: row.kind ?? row.type,
      ...(row.data?.key !== undefined && { key: row.data.key }),
      ...(value !== undefined && { value }),
      ...(row.data?.coin_type !== undefined && {
        coinType: row.data.coin_type,
      }),
    },
  ]
}

/**
 * A legacy `setAddr(node, a)` logs both `AddrChanged` and `AddressChanged`;
 * bigname keeps each log as its own `addr:60` row. They are one write.
 */
const dropDoubleEmits = (
  events: readonly RecordHistoryEvent[],
): RecordHistoryEvent[] => {
  const seen = new Set<string>()
  return events.filter((event) => {
    const identity = `${event.transactionID}\u0000${event.key ?? ''}\u0000${event.value ?? ''}`
    if (event.key === undefined) return true
    if (seen.has(identity)) return false
    seen.add(identity)
    return true
  })
}

/**
 * A record's write history across every resolver the name has pointed at,
 * ENSv1 and ENSv2 alike, newest first. One exact key is asked for by
 * `record_key`, which keeps that key's writes and every record reset; a family
 * reads every `record` row and filters them here.
 */
const getRecordHistory = (
  { name, key }: RecordHistoryParameters,
  signal?: AbortSignal,
) =>
  fromPromise(
    fetchAllPages(
      (cursor) =>
        bigname.getNameHistory(
          normalizeOrLower(name),
          {
            type: 'record',
            ...(!isFamily(key) && { record_key: key }),
            include: ['data', 'raw'],
            order: 'desc',
            page_size: MAX_PAGE_SIZE,
            cursor,
          },
          { signal },
        ),
      {
        maxRows: Number.POSITIVE_INFINITY,
        maxPages: Number.POSITIVE_INFINITY,
        signal,
      },
    ),
    (e) => new GetRecordHistoryError({ cause: e as BignameError }),
  ).map(({ rows }) =>
    dropDoubleEmits(
      rows.filter((row) => matchesKey(row, key)).flatMap(toRecordHistoryEvent),
    ),
  )

const getRecordHistoryQueryKey = createQueryKey<
  'get-record-history',
  RecordHistoryParameters
>('get-record-history')

export const getRecordHistoryQueryOptions = (params: RecordHistoryParameters) =>
  resultQueryOptions({
    queryKey: getRecordHistoryQueryKey(params),
    queryFn: ({ queryKey: [, params], signal }) =>
      getRecordHistory(params, signal),
  })
