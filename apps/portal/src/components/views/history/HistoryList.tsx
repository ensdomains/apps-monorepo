import type { GetNameHistoryReturnType } from '@ensdomains/ensjs/subgraph'
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
import { columns } from '@/components/organisms/HistoryTable/columns'
import { HistoryTable } from '@/components/organisms/HistoryTable/HistoryTable'
import { useBlockTimestamps } from '@/features/profile/hooks/useBlockTimestamps'

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

  // Helper function to extract "from" address from an event
  const extractFromAddress = (
    event: unknown,
  ): Address | null => {
    const evt = event as Record<string, unknown>
    
    // Try to get owner, registrant, or newOwner
    if (evt.owner && typeof evt.owner === 'string') return evt.owner as Address
    if (evt.registrant && typeof evt.registrant === 'string')
      return evt.registrant as Address
    if (evt.newOwner && typeof evt.newOwner === 'string')
      return evt.newOwner as Address
    if (evt.addr && typeof evt.addr === 'object' && evt.addr !== null) {
      const addr = evt.addr as Record<string, unknown>
      if (addr.id && typeof addr.id === 'string') return addr.id as Address
    }
    
    return null
  }

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

    // Add domain events
    history.domainEvents.forEach((event) => {
      if (!transactionMap.has(event.transactionID)) {
        transactionMap.set(event.transactionID, {
          transactionID: event.transactionID,
          blockNumber: event.blockNumber,
          from: extractFromAddress(event),
          events: [],
        })
      }
      const tx = transactionMap.get(event.transactionID)!
      // Update from address if we don't have one yet
      if (!tx.from) {
        tx.from = extractFromAddress(event)
      }
      tx.events.push({
        id: event.id,
        type: event.type,
        category: 'domain',
        details: event,
      })
    })

    // Add registration events
    history.registrationEvents?.forEach((event) => {
      if (!transactionMap.has(event.transactionID)) {
        transactionMap.set(event.transactionID, {
          transactionID: event.transactionID,
          blockNumber: event.blockNumber,
          from: extractFromAddress(event),
          events: [],
        })
      }
      const tx = transactionMap.get(event.transactionID)!
      if (!tx.from) {
        tx.from = extractFromAddress(event)
      }
      tx.events.push({
        id: event.id,
        type: event.type,
        category: 'registration',
        details: event,
      })
    })

    // Add resolver events
    history.resolverEvents?.forEach((event) => {
      if (!transactionMap.has(event.transactionID)) {
        transactionMap.set(event.transactionID, {
          transactionID: event.transactionID,
          blockNumber: event.blockNumber,
          from: extractFromAddress(event),
          events: [],
        })
      }
      const tx = transactionMap.get(event.transactionID)!
      if (!tx.from) {
        tx.from = extractFromAddress(event)
      }
      tx.events.push({
        id: event.id,
        type: event.type,
        category: 'resolver',
        details: event,
      })
    })

    // Convert map to array and sort by block number (most recent first)
    return Array.from(transactionMap.values()).sort(
      (a, b) => b.blockNumber - a.blockNumber,
    )
  }, [history])

  // Fetch timestamps for all blocks
  const {
    data: timestamps,
    isLoading: timestampsLoading,
    error: timestampsError,
  } = useBlockTimestamps({
    blocks: groupedEvents.map((tx) => BigInt(tx.blockNumber)),
  })

  // Add timestamps to grouped events
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
  })

  const eventCount = groupedEvents.length

  const searchHistoryId = useId()

  if (timestampsLoading) return <div>Loading timestamps...</div>
  if (timestampsError)
    return <div>Error loading timestamps: {timestampsError.message}</div>

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
      <HistoryTable name={name} table={table} />
    </>
  )
}

