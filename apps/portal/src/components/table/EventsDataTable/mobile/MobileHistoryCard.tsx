import type { Row, Table as TableData } from '@tanstack/react-table'
import type { Address } from 'viem'
import { CopyableRecord } from '@/components/CopyableRecord'
import { AddressDisplay } from '@/components/table/EventsDataTable/AddressDisplay'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import type { BaseEvent, EventsTableData } from '../types'
import { MobileCardField } from './MobileCardField'
import { MobileCardHeader } from './MobileCardHeader'
import { MobileExpandedEvents } from './MobileExpandedEvents'

const formatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

interface MobileHistoryCardProps<TEvent extends BaseEvent> {
  row: Row<EventsTableData<TEvent>>
  table: TableData<EventsTableData<TEvent>>
}

export const MobileHistoryCard = <TEvent extends BaseEvent = BaseEvent>({
  row,
  table,
}: MobileHistoryCardProps<TEvent>) => {
  const { timestamp, transactionID: txId, from, network } = row.original

  // Check if sidebar and network columns are enabled
  const hasSidebar = table.getAllColumns().some((col) => col.id === 'more')
  const hasNetwork = table.getAllColumns().some((col) => col.id === 'network')

  return (
    <div className="flex flex-col gap-2 px-6 py-4 bg-white border-b border-border last:border-b-0">
      <MobileCardHeader row={row} table={table} hasSidebar={hasSidebar} />

      {/* Date */}
      {timestamp && (
        <MobileCardField label="Date">
          {formatter
            .format(new Date(Number(timestamp) * 1000))
            .replace(/-/g, '/')}
        </MobileCardField>
      )}

      {/* Transaction */}
      <MobileCardField label="Transaction">
        <CopyableRecord
          value={txId}
          displayValue={
            <span className="font-mono">{truncateAddress(txId)}</span>
          }
          className="text-sm underline decoration-dashed underline-offset-4"
          href={`https://sepolia.etherscan.io/tx/${txId}`}
        />
      </MobileCardField>

      {/* From */}
      {from && (
        <MobileCardField label="From">
          <AddressDisplay address={from as Address} />
        </MobileCardField>
      )}

      {/* Network */}
      {hasNetwork && network && (
        <MobileCardField label="Network">
          <div className="flex flex-row items-center gap-2">
            {network.icon && (
              <img src={network.icon} alt={network.name} className="w-4 h-4" />
            )}
            <span>{network.name}</span>
          </div>
        </MobileCardField>
      )}

      {/* Expanded events */}
      {row.getIsExpanded() && (
        <MobileExpandedEvents events={row.original.events} />
      )}
    </div>
  )
}
