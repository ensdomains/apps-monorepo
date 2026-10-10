import {
  MAX_PAGE_SIZE,
  type NameHistoryRow,
  readAllCollectionPages,
  toUnixSeconds,
} from '@ens-apps/indexer/bigname'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { Hash } from 'viem'
import { bigname } from '@/lib/bigname'
import { normalizeOrLower } from '@/utils/ens/normalizeOrLower'
import { recordValueText } from '@/utils/history/recordValue'

class GetRecordHistoryError extends TaggedError('GetRecordHistoryError')<{
  cause: unknown
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
  row: NameHistoryRow,
  wanted: RecordHistoryParameters['key'],
): boolean => {
  if (row.type !== 'record') return false
  if (row.kind === 'RecordVersionChanged') return true
  const key = row.data?.key
  if (!key) return false
  return isFamily(wanted) ? FAMILY_MATCHERS[wanted](key) : key === wanted
}

const toRecordHistoryEvent = (row: NameHistoryRow): RecordHistoryEvent[] => {
  const timestamp = toUnixSeconds(row.timestamp)
  if (
    row.type !== 'record' ||
    !row.transaction_hash ||
    row.block_number === null ||
    timestamp === null
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
 * A record's write history across every resolver the name has pointed at,
 * ENSv1 and ENSv2 alike, newest first. One exact key is asked for by
 * `record_key`, which keeps that key's writes and every record reset; a family
 * reads every `record` row and filters them here.
 */
const getRecordHistory = ({ name, key }: RecordHistoryParameters) =>
  readAllCollectionPages<NameHistoryRow>((cursor) =>
    bigname.nameHistory(normalizeOrLower(name), {
      type: ['record'],
      ...(!isFamily(key) && { record_key: key }),
      include: ['data', 'raw'],
      order: 'desc',
      page_size: MAX_PAGE_SIZE,
      ...(cursor && { cursor }),
    }),
  )
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
    queryFn: ({ queryKey: [, params] }) => getRecordHistory(params),
  })
