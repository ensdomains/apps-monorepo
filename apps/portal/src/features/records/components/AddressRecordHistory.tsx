import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ErrorMessage } from '@/components/ErrorMessage'
import { HistorySectionHeader } from '@/components/HistorySectionHeader'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EventsDataTable } from '@/components/table/EventsDataTable'
import { useTransactionSenders } from '@/features/profile/hooks/useTransactionSenders'
import { getRecordHistoryQueryOptions } from '@/features/records/hooks/useRecordHistory'
import { groupEventsByTransactionId } from '@/utils/history/groupEventsByTransactionId'

/**
 * A name's address-record history, one row per transaction. The sender comes
 * from the transaction when it can be read, else from the event itself.
 */
export const AddressRecordHistory = ({
  name,
  action,
}: {
  readonly name: string
  /** Shown beside the section heading, e.g. a "Full history" link. */
  readonly action?: ReactNode
}) => {
  const {
    data: history,
    isLoading,
    error,
  } = useQuery(getRecordHistoryQueryOptions({ name, key: 'coins' }))
  // bigname dates every row, so the grouped transactions carry their timestamp.
  const transactions = groupEventsByTransactionId(history ?? [], 'resolver')
  const { data: senders } = useTransactionSenders({
    transactionHashes: transactions.map((tx) => tx.transactionID),
  })

  if (isLoading) return <LoadingSpinner title="Loading history..." />
  if (error) {
    return (
      <ErrorMessage
        compact
        description="Error fetching history. Please refresh the page."
      />
    )
  }
  if (transactions.length === 0) {
    return <div className="text-muted-foreground">No history available</div>
  }

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <HistorySectionHeader action={action} />
      <EventsDataTable
        enableTransactionCount={false}
        enableFilters={false}
        enableSearch={false}
        name={name}
        data={transactions.map((tx) => ({
          ...tx,
          from: senders?.get(tx.transactionID) ?? tx.from,
        }))}
      />
    </div>
  )
}
