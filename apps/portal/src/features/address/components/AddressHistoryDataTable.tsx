import { useMemo } from 'react'
import type { Address, Hash } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { PageHeading } from '@/components/PageHeading'
import { EventsDataTable } from '@/components/table/EventsDataTable'
import { useTransactionSenders } from '@/features/profile/hooks/useTransactionSenders'
import {
  type AddressNameHistory,
  groupAddressHistoryByName,
} from '@/utils/history/transformAddressHistory'
import type { ENSEvent } from '@/utils/history/transformHistoryToEvents'
import { partitionAddressHistory } from '../nameAttribution'

const defaultNetwork = {
  name: 'Sepolia',
  icon: '/icons/eth.svg',
}

/** Each transaction row with its sender from the receipt, where one was read. */
const withSenders = <T extends { transactionID: string; from: Address | null }>(
  rows: readonly T[],
  senders: ReadonlyMap<Hash, Address> | undefined,
): T[] =>
  senders
    ? rows.map((tx) => ({
        ...tx,
        from: senders.get(tx.transactionID as Hash) || tx.from,
      }))
    : []

export const AddressHistoryDataTable = ({
  address,
  history,
}: {
  readonly address: Address
  readonly history: readonly AddressNameHistory[]
}) => {
  // One group per name, so each name's provenance survives until it is judged
  const groups = useMemo(() => groupAddressHistoryByName(history), [history])

  // Metadata is fetched for every name, acquired or not: the transaction senders
  // are themselves one of the signals the attribution depends on.
  const allEvents = useMemo(
    () => groups.flatMap((group) => group.events),
    [groups],
  )

  const transactionHashes = useMemo(
    () => allEvents.map((event) => event.transactionID as Hash),
    [allEvents],
  )

  // Fetch senders for all transactions
  const {
    data: sendersData,
    isLoading: isLoadingSenders,
    error: sendersError,
  } = useTransactionSenders({
    transactionHashes,
  })

  const { acquired, assigned, assignedNameCount } = useMemo(
    () => partitionAddressHistory(groups, address, sendersData),
    [groups, address, sendersData],
  )

  // bigname dates every row, so only the sender comes from the chain.
  const acquiredEvents = useMemo(
    () => withSenders(acquired, sendersData),
    [acquired, sendersData],
  )

  const assignedEvents = useMemo(
    () => withSenders(assigned, sendersData),
    [assigned, sendersData],
  )

  if (isLoadingSenders) {
    return <LoadingMessage title="Loading transaction senders" />
  }

  if (sendersError) {
    return (
      <ErrorMessage
        compact
        description="Error fetching transaction senders. Please refresh the page."
      />
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeading parent={{ type: 'addr', addr: address }}>
        {acquiredEvents.length === 0
          ? 'History'
          : `History (${acquiredEvents.length})`}
      </PageHeading>
      {acquiredEvents.length === 0 ? (
        <NoResultsMessage
          title="No history yet"
          description="This address doesn't have any recorded history. Activity will appear here once transactions are made."
          className="mx-0"
        />
      ) : (
        <EventsDataTable<ENSEvent>
          data={acquiredEvents}
          name="" // Name will be extracted from individual transaction events in the sidebar
          enableSidebar={true}
          enableFilters={true}
          enableSearch={true}
          enableTransactionCount={false}
          defaultNetwork={defaultNetwork}
        />
      )}
      {assignedEvents.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-h2">
              {`Names assigned to this address (${assignedNameCount})`}
            </h2>
            <p className="text-sm text-muted-foreground">
              Anyone who owns a name can point a subname at any address without
              that address's involvement, and choose the resolver that writes
              its records. The activity below belongs to names assigned to this
              address by someone else — it is not this address's own history,
              and its contents are not vouched for.
            </p>
          </div>
          <EventsDataTable<ENSEvent>
            data={assignedEvents}
            name=""
            enableSidebar={true}
            enableFilters={false}
            enableSearch={false}
            enableTransactionCount={false}
            defaultNetwork={defaultNetwork}
          />
        </section>
      )}
    </div>
  )
}
