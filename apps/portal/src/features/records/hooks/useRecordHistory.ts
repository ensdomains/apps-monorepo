import {
  type HistoryEvent,
  type IndexerReadError,
  readAllItems,
} from '@ens-apps/indexer/reads'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { Hash } from 'viem'
import { dropUnassignedRecords } from '@/features/history/assignedResolvers'
import { requireIndexed } from '@/features/history/requireIndexed'
import { indexer } from '@/lib/indexer'
import { normalizeOrLower } from '@/utils/ens/normalizeOrLower'
import { recordValueText } from '@/utils/history/recordValue'

class GetRecordHistoryError extends TaggedError('GetRecordHistoryError')<{
  cause: IndexerReadError
}> {}

/** The indexer's largest history page. */
const MAX_PAGE_SIZE = 200

/** Every record of one family. */
type RecordHistoryFamily = 'coins' | 'texts' | 'contentHash' | 'abi'

export type RecordHistoryParameters = {
  readonly name: string
  /**
   * A record family, or one stored record key in the record-key grammar
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
  readonly transactionID: Hash
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
  texts: (key) => key.startsWith('text:'),
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
  if (
    row.type !== 'record' ||
    !row.transactionHash ||
    row.blockNumber === null ||
    row.timestamp === null
  )
    return []
  const value = recordValueText(row.data?.value)
  return [
    {
      id: `${row.transactionHash}-${String(row.logIndex ?? '')}`,
      transactionID: row.transactionHash,
      blockNumber: row.blockNumber,
      timestamp: BigInt(Math.floor(row.timestamp.getTime() / 1000)),
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
 * A record's write history across every resolver the name has pointed at,
 * ENSv1 and ENSv2 alike, newest first. One exact key is asked for by
 * `recordKey`, which keeps that key's writes and every record reset; a family
 * reads every `record` row and filters them here.
 */
const getRecordHistory = (
  { name, key }: RecordHistoryParameters,
  signal?: AbortSignal,
) =>
  readAllItems(
    (cursor, pageSignal) =>
      indexer
        .getNameHistory(
          {
            name: normalizeOrLower(name),
            types: ['record'],
            ...(!isFamily(key) && { recordKey: key }),
            order: 'desc',
            pageSize: MAX_PAGE_SIZE,
            ...(cursor && { cursor }),
          },
          { signal: pageSignal },
        )
        .andThen(requireIndexed(name)),
    { signal },
  )
    .andThen((rows) => dropUnassignedRecords(rows, signal))
    .map((rows) =>
      rows.filter((row) => matchesKey(row, key)).flatMap(toRecordHistoryEvent),
    )
    .mapErr((cause) => new GetRecordHistoryError({ cause }))

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
