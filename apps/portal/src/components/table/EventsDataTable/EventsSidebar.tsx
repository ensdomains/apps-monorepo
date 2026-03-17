import type { Row } from '@tanstack/react-table'
import type { FC, PropsWithChildren } from 'react'
import type { Hash } from 'viem'
import { useTransaction } from 'wagmi'
import { CopyableRecord } from '@/components/CopyableRecord'
import { DataRow } from '@/components/DataRow'
import type { EventsTableData } from '@/components/table/EventsDataTable'
import { AddressDisplay } from '@/components/table/EventsDataTable/AddressDisplay'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { useIsMobile } from '@/hooks/use-mobile'
import { useBlockExplorerTxUrl } from '@/utils/blockExplorer/useBlockExplorerUrl'
import { formatTimestamp } from '@/utils/formatting/formatTimestamp'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import type { ENSEvent } from '@/utils/history/transformHistoryToEvents'
import { TransactionEvents } from './TransactionEvents'

type ENSTransaction = EventsTableData<ENSEvent>

interface NameDisplayProps {
  name: string
}

const NameDisplay = ({ name }: NameDisplayProps) => {
  return (
    <div className="flex flex-row items-center gap-2">
      <NameAvatar name={name} height="20px" width="20px" rounded="rounded-sm" />
      <CopyableRecord
        value={name}
        displayValue={<span className="flex items-center gap-1">{name}</span>}
        className="underline decoration-dashed underline-offset-4"
        href={`/name/${name}`}
      />
    </div>
  )
}

interface TransactionDetailsProps {
  txHash: Hash
  name: string
  timestamp?: bigint
  events: ENSEvent[]
}

const TransactionDetails = ({
  txHash,
  name,
  timestamp,
  events,
}: TransactionDetailsProps) => {
  const { data, isLoading, error } = useTransaction({
    hash: txHash,
  })
  const txUrl = useBlockExplorerTxUrl(txHash, data?.chainId)

  const formattedTimestamp = formatTimestamp(timestamp)

  // Extract name from events if not provided at top level
  const displayName =
    name || events.find((e) => e.id && !e.id.startsWith('0x'))?.id || ''

  if (isLoading) {
    return (
      <div className="p-6 flex flex-col gap-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 flex flex-col gap-4">
        <div className="text-red-500">
          Error loading transaction: {error.message}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="flex flex-col gap-4 p-6 border border-border rounded-lg">
        {displayName && (
          <DataRow label="Name">
            <NameDisplay name={displayName} />
          </DataRow>
        )}

        <DataRow label="Tx Hash">
          <CopyableRecord
            value={txHash}
            displayValue={
              <span className="flex items-center gap-1">
                {truncateAddress(txHash, 10, 8, '...')}
              </span>
            }
            href={txUrl}
          />
        </DataRow>

        {formattedTimestamp && (
          <DataRow label="Timestamp">
            <CopyableRecord
              value={txHash}
              displayValue={<span>{formattedTimestamp} UTC</span>}
            />
          </DataRow>
        )}

        {data && (
          <>
            <DataRow label="Network">
              <span>Sepolia</span>
            </DataRow>

            <DataRow label="From">
              <AddressDisplay address={data.from} />
            </DataRow>

            <DataRow label="To">
              {data.to ? (
                <AddressDisplay address={data.to} />
              ) : (
                <span className="text-quartz-500">Contract Creation</span>
              )}
            </DataRow>
          </>
        )}
      </div>

      <TransactionEvents events={events} txHash={txHash} />
    </div>
  )
}

interface EventsSidebarProps extends PropsWithChildren {
  row: Row<ENSTransaction> | null
  name: string
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
}

export const EventsSidebar: FC<EventsSidebarProps> = ({
  children,
  row,
  name,
  open,
  setOpen,
}) => {
  const isMobile = useIsMobile()

  return (
    <Sheet open={open} onOpenChange={setOpen} defaultOpen={false}>
      {children}
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className="sm:max-w-[880px] bg-white p-0 flex flex-col h-dvh"
      >
        {/* Fixed header at the top */}
        <div className="p-6 shrink-0 border-b">
          <SheetHeader>
            <SheetTitle className="font-sans text-heading font-medium">
              Transaction
            </SheetTitle>
          </SheetHeader>
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto">
          {row ? (
            <TransactionDetails
              txHash={row.original.transactionID as Hash}
              name={name}
              timestamp={row.original.timestamp}
              events={row.original.events}
            />
          ) : (
            <div className="text-quartz-400 text-center py-12">
              No transaction selected
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
