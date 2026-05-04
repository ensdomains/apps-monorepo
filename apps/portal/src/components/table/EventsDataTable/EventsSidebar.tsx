import type { FC, PropsWithChildren } from 'react'
import type { Hash } from 'viem'
import { useTransaction } from 'wagmi'
import { EntityBadgeWithActions } from '@/components/EntityBadge'
import { InfoCard, InfoRow } from '@/components/InfoCard'
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
      <EntityBadgeWithActions variant="name" name={name}>
        {name}
      </EntityBadgeWithActions>
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
      <InfoCard title="Transaction details">
        {displayName && (
          <InfoRow label="Name">
            <NameDisplay name={displayName} />
          </InfoRow>
        )}

        <InfoRow label="Tx Hash">
          <EntityBadgeWithActions
            variant="tx"
            copyValue={txHash}
            etherscanHref={txUrl}
          >
            {truncateAddress(txHash, 10, 8, '...')}
          </EntityBadgeWithActions>
        </InfoRow>

        {formattedTimestamp && (
          <InfoRow label="Timestamp">
            <span className="text-sm pl-3.5">{formattedTimestamp} UTC</span>
          </InfoRow>
        )}

        {data && (
          <>
            <InfoRow label="Network">
              <span className="text-sm pl-3.5">Sepolia</span>
            </InfoRow>

            <InfoRow label="From">
              <AddressDisplay address={data.from} />
            </InfoRow>

            <InfoRow label="To">
              {data.to ? (
                <AddressDisplay address={data.to} variant="contract" />
              ) : (
                <span className="text-sm pl-3.5 text-muted-foreground">
                  Contract Creation
                </span>
              )}
            </InfoRow>
          </>
        )}
      </InfoCard>

      <TransactionEvents events={events} txHash={txHash} />
    </div>
  )
}

interface EventsSidebarProps extends PropsWithChildren {
  transaction: ENSTransaction | null
  name: string
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
  title?: string
}

export const EventsSidebar: FC<EventsSidebarProps> = ({
  children,
  transaction,
  name,
  open,
  setOpen,
  title = 'Transaction',
}) => {
  const isMobile = useIsMobile()

  return (
    <Sheet open={open} onOpenChange={setOpen} defaultOpen={false}>
      {children}
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className="sm:max-w-220 bg-card p-0 flex flex-col h-dvh"
      >
        {/* Fixed header at the top */}
        <div className="p-6 shrink-0 border-b">
          <SheetHeader>
            <SheetTitle className="font-sans text-heading font-medium">
              {title}
            </SheetTitle>
          </SheetHeader>
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto">
          {transaction ? (
            <TransactionDetails
              txHash={transaction.transactionID as Hash}
              name={name}
              timestamp={transaction.timestamp}
              events={transaction.events}
            />
          ) : (
            <div className="text-muted-foreground text-center py-12">
              No transaction selected
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
