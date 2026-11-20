import type { HistoryEvent } from '../reads/history.types'
import { toAddress, toDate } from './adapters'
import type { EventRow, NameHistoryRow } from './types'

/** A bigname history row with its payload as served; `data` is `{}` when omitted. */
export const toHistoryEvent = (row: EventRow | NameHistoryRow): HistoryEvent =>
  // A row's `type` and `data` arrive together; spreading them loses the pairing TypeScript checks.
  ({
    id: row.id,
    name: row.name ?? null,
    ...('subject' in row &&
      row.subject !== undefined && {
        subject: row.subject,
      }),
    registrationId: row.registration_id,
    blockNumber: row.block_number,
    timestamp: toDate(row.timestamp),
    transactionHash: row.transaction_hash,
    logIndex: row.log_index,
    contractAddress: toAddress(row.contract_address ?? undefined),
    kind: row.kind ?? null,
    type: row.type,
    data: row.data ?? {},
  }) as HistoryEvent
