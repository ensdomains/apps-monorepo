import type { Row } from '@tanstack/react-table'
import { format } from 'date-fns'
import type { FC, PropsWithChildren, ReactNode } from 'react'
import type { Hash } from 'viem'
import { useEnsAddress, useTransaction } from 'wagmi'
import { CopyableRecord } from '@/components/molecules/CopyableRecord'
import { AddressDisplay } from '@/components/organisms/HistoryTable/AddressDisplay'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useIsMobile } from '@/hooks/use-mobile'
import type { HistoryTransaction } from './columns'
import { TransactionEvents } from './TransactionEvents'

const DetailRow = ({ label, value }: { label: string; value: ReactNode }) => {
  return (
    <div className="flex flex-row gap-6 items-center">
      <span className="text-sm text-black font-medium sm:min-w-[160px]">
        {label}
      </span>
      <div className="flex-1">{value}</div>
    </div>
  )
}

const NameDisplay = ({ name }: { name: string }) => {
  const { data: address, isLoading } = useEnsAddress({
    name,
  })

  if (isLoading) {
    return (
      <div className="flex flex-row items-center gap-2">
        <div
          className="w-5 h-5 rounded-sm"
          style={{
            background: 'var(--avatar-placeholder-gradient)',
          }}
        />
        <span className="text-sm text-gray-400">Loading...</span>
      </div>
    )
  }

  return (
    <div className="flex flex-row items-center gap-2">
      <NameAvatar name={name} height="20px" width="20px" rounded="rounded-sm" />
      <CopyableRecord
        value={address || name}
        displayValue={<span>{name}</span>}
        className="text-sm underline decoration-dashed underline-offset-4"
      />
    </div>
  )
}

const TransactionDetails = ({
  txHash,
  name,
  timestamp,
  events,
}: {
  txHash: Hash
  name: string
  timestamp?: bigint
  events: Array<{
    id: string
    type: string
    category: 'domain' | 'registration' | 'resolver'
    details: Record<string, unknown>
  }>
}) => {
  const { data: transaction, isLoading: txLoading } = useTransaction({
    hash: txHash,
  })

  if (txLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <DetailRow label="Name" value={<NameDisplay name={name} />} />

        <DetailRow
          label="Tx Hash"
          value={
            <CopyableRecord
              value={txHash}
              className="text-sm"
              displayValue={
                <span className="flex items-center gap-1">
                  {txHash.slice(0, 10)}...{txHash.slice(-8)}
                </span>
              }
            />
          }
        />

        {timestamp && (
          <DetailRow
            label="Timestamp"
            value={
              <span className="text-sm">
                {format(
                  new Date(Number(timestamp) * 1000),
                  'yyyy/MM/dd HH:mm:ss',
                )}{' '}
                UTC
              </span>
            }
          />
        )}

        {transaction && (
          <>
            <DetailRow
              label="Network"
              value={<span className="text-sm">Sepolia</span>}
            />

            <DetailRow
              label="From"
              value={<AddressDisplay address={transaction.from} />}
            />

            <DetailRow
              label="To"
              value={
                transaction.to ? (
                  <AddressDisplay address={transaction.to} />
                ) : (
                  <span className="text-sm text-gray-500">
                    Contract Creation
                  </span>
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

export const HistorySidebar: FC<
  PropsWithChildren<{
    row: Row<HistoryTransaction> | null
    name: string
    open: boolean
    setOpen: React.Dispatch<React.SetStateAction<boolean>>
  }>
> = ({ children, row, name, open, setOpen }) => {
  const isMobile = useIsMobile()

  return (
    <Sheet open={open} onOpenChange={setOpen} defaultOpen={false}>
      {children}
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className="sm:max-w-[880px] bg-white overflow-y-auto"
      >
        {row ? (
          <div className="flex flex-col gap-6 p-6">
            <h2 className="text-2xl font-bold">Transaction</h2>

            <TransactionDetails
              txHash={row.original.transactionID as Hash}
              name={name}
              timestamp={row.original.timestamp}
              events={row.original.events}
            />
          </div>
        ) : (
          <div className="text-gray-400 text-center py-12">
            No transaction selected
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
