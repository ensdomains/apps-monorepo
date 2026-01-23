import type { Row } from '@tanstack/react-table'
import type { FC, PropsWithChildren, ReactNode } from 'react'
import type { Hash } from 'viem'
import { useTransaction } from 'wagmi'
import { CopyableRecord } from '@/components/CopyableRecord'
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
import { formatTimestamp } from '@/utils/formatting/formatTimestamp'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import type { ENSEvent } from '@/utils/history/transformHistoryToEvents'
import { TransactionEvents } from './TransactionEvents'

type ENSTransaction = EventsTableData<ENSEvent>

interface DetailRowProps {
  label: string
  value: ReactNode
}

const DetailRow = ({ label, value }: DetailRowProps) => {
  return (
    <div className="flex flex-col sm:flex-row gap-2 sm:gap-6 items-start sm:items-center">
      <span className="text-black font-medium shrink-0 xs:min-w-[160px]">
        {label}
      </span>
      <div className="flex-1 min-w-0">{value}</div>
    </div>
  )
}

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
      <div className="flex flex-col gap-4">
        {displayName && (
          <DetailRow label="Name" value={<NameDisplay name={displayName} />} />
        )}

        <DetailRow
          label="Tx Hash"
          value={
            <CopyableRecord
              value={txHash}
              displayValue={
                <span className="flex items-center gap-1">
                  {truncateAddress(txHash, 10, 8, '...')}
                </span>
              }
              href={`https://sepolia.etherscan.io/tx/${txHash}`}
            />
          }
        />

        {formattedTimestamp && (
          <DetailRow
            label="Timestamp"
            value={
              <CopyableRecord
                value={txHash}
                displayValue={<span>{formattedTimestamp} UTC</span>}
              />
            }
          />
        )}

        {data && (
          <>
            <DetailRow label="Network" value={<span>Sepolia</span>} />

            <DetailRow
              label="From"
              value={<AddressDisplay address={data.from} />}
            />

            <DetailRow
              label="To"
              value={
                data.to ? (
                  <AddressDisplay address={data.to} />
                ) : (
                  <span className="text-gray-500">Contract Creation</span>
                )
              }
            />
          </>
        )}
      </div>

      <div className="pt-6">
        <TransactionEvents events={events} txHash={txHash} />
      </div>
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
            <SheetTitle className="font-sans text-[28px] font-medium">
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
            <div className="text-gray-400 text-center py-12">
              No transaction selected
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
