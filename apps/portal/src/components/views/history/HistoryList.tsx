import type { GetNameHistoryReturnType } from '@ensdomains/ensjs/subgraph'
import type { Row } from '@tanstack/react-table'
import {
  type ColumnFiltersState,
  type ExpandedState,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { SearchIcon } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import type { Address } from 'viem'
import {
  columns,
  type HistoryTransaction,
} from '@/components/organisms/HistoryTable/columns'
import { HistoryTable } from '@/components/organisms/HistoryTable/HistoryTable'
import { useBlockTimestamps } from '@/features/profile/hooks/useBlockTimestamps'
import {
  extractEventAddress,
  findAddressFromEvents,
} from '@/utils/history/extractEventAddress'

export const HistoryList = ({
  name,
  history,
}: {
  name: string
  history: GetNameHistoryReturnType
}) => {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [expanded, setExpanded] = useState<ExpandedState>({})
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [clickedRow, setClickedRow] = useState<Row<HistoryTransaction> | null>(
    null,
  )

  // Group all events by transaction ID
  const groupedEvents = useMemo(() => {
    if (!history) return []

    const transactionMap = new Map<
      string,
      {
        transactionID: string
        blockNumber: number
        from: Address | null
        events: Array<{
          id: string
          type: string
          category: 'domain' | 'registration' | 'resolver'
          details: unknown
        }>
      }
    >()

    history.domainEvents.forEach((event) => {
      if (!transactionMap.has(event.transactionID)) {
        transactionMap.set(event.transactionID, {
          transactionID: event.transactionID,
          blockNumber: event.blockNumber,
          from: extractEventAddress(event),
          events: [],
        })
      }
      const tx = transactionMap.get(event.transactionID)
      if (!tx) return
      if (!tx.from) {
        tx.from = extractEventAddress(event)
      }
      tx.events.push({
        id: event.id,
        type: event.type,
        category: 'domain',
        details: event,
      })
    })

    history.registrationEvents?.forEach((event) => {
      if (!transactionMap.has(event.transactionID)) {
        transactionMap.set(event.transactionID, {
          transactionID: event.transactionID,
          blockNumber: event.blockNumber,
          from: extractEventAddress(event),
          events: [],
        })
      }
      const tx = transactionMap.get(event.transactionID)
      if (!tx) return
      if (!tx.from) {
        tx.from = extractEventAddress(event)
      }
      tx.events.push({
        id: event.id,
        type: event.type,
        category: 'registration',
        details: event,
      })
    })

    history.resolverEvents?.forEach((event) => {
      if (!transactionMap.has(event.transactionID)) {
        transactionMap.set(event.transactionID, {
          transactionID: event.transactionID,
          blockNumber: event.blockNumber,
          from: extractEventAddress(event),
          events: [],
        })
      }
      const tx = transactionMap.get(event.transactionID)
      if (!tx) return
      if (!tx.from) {
        tx.from = extractEventAddress(event)
      }
      tx.events.push({
        id: event.id,
        type: event.type,
        category: 'resolver',
        details: event,
      })
    })

    return Array.from(transactionMap.values())
      .map((tx) => ({
        ...tx,
        from: tx.from || findAddressFromEvents(tx.events),
      }))
      .sort((a, b) => b.blockNumber - a.blockNumber)
  }, [history])

  const {
    data: timestamps,
    isLoading: timestampsLoading,
    error: timestampsError,
  } = useBlockTimestamps({
    blocks: groupedEvents.map((tx) => BigInt(tx.blockNumber)),
  })

  const groupedEventsWithTimestamps = useMemo(() => {
    if (!timestamps) return []
    return groupedEvents.map((tx) => ({
      ...tx,
      timestamp: timestamps.get(BigInt(tx.blockNumber)),
    }))
  }, [groupedEvents, timestamps])

  const table = useReactTable({
    data: groupedEventsWithTimestamps,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onExpandedChange: setExpanded,
    getExpandedRowModel: getExpandedRowModel(),
    state: {
      sorting,
      columnFilters,
      expanded,
    },
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    meta: {
      onMoreClick: (row: Row<HistoryTransaction>) => {
        setClickedRow(row)
        setSidebarOpen(true)
      },
    },
  })

  const eventCount = groupedEvents.length

  const searchHistoryId = useId()

  if (timestampsLoading) return <div>Loading timestamps...</div>
  if (timestampsError)
    return <div>Error loading timestamps: {timestampsError.cause?.message}</div>

  return (
    <>
      <header className="bg-gray-100 px-8 pb-4 pt-12 flex flex-col gap-4">
        <div className="flex flex-row justify-between">
          <h1 className="text-[28px] font-medium">
            {eventCount} Transaction{eventCount !== 1 ? 's' : ''}
          </h1>
        </div>
        <div className="flex flex-row gap-2 w-full bg-white rounded-sm p-2 h-10">
          <label htmlFor={searchHistoryId} aria-label="Search history">
            <SearchIcon />
          </label>
          <input
            id={searchHistoryId}
            className="w-full"
            placeholder="Search transactions..."
            onChange={(event) => table.setGlobalFilter(event.target.value)}
          />
        </div>
      </header>
      <HistoryTable
        name={name}
        table={table}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        clickedRow={clickedRow}
      />
    </>
  )
}
