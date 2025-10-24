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
import { CollapseAllButton } from '@/components/table/CollapseAllButton'
import { TableMultiSelectFilter } from '@/components/table/TableMultiSelectFilter'
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
  const [selectedEventTypes, setSelectedEventTypes] = useState<string[]>([])

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

  const eventTypesByCategory = useMemo(() => {
    const domainEvents = new Set<string>()
    const registrationEvents = new Set<string>()
    const resolverEvents = new Set<string>()

    groupedEvents.forEach((tx) => {
      tx.events.forEach((event) => {
        if (event.category === 'domain') {
          domainEvents.add(event.type)
        } else if (event.category === 'registration') {
          registrationEvents.add(event.type)
        } else if (event.category === 'resolver') {
          resolverEvents.add(event.type)
        }
      })
    })

    return {
      domain: Array.from(domainEvents).sort(),
      registration: Array.from(registrationEvents).sort(),
      resolver: Array.from(resolverEvents).sort(),
    }
  }, [groupedEvents])

  const filteredData = useMemo(() => {
    if (selectedEventTypes.length === 0) {
      return groupedEventsWithTimestamps
    }

    return groupedEventsWithTimestamps.filter((tx) => {
      return tx.events.some((event) => selectedEventTypes.includes(event.type))
    })
  }, [groupedEventsWithTimestamps, selectedEventTypes])

  const table = useReactTable({
    data: filteredData,
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
    globalFilterFn: (row, _columnId, filterValue) => {
      const searchValue = filterValue.toLowerCase()
      const tx = row.original

      if (tx.transactionID.toLowerCase().includes(searchValue)) return true

      if (tx.events.some((e) => e.type.toLowerCase().includes(searchValue)))
        return true

      return false
    },
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

  const handleCollapseAll = () => {
    if (Object.keys(expanded).length > 0) {
      setExpanded({})
    } else {
      const allExpanded: ExpandedState = {}
      filteredData.forEach((_, index) => {
        allExpanded[index] = true
      })
      setExpanded(allExpanded)
    }
  }

  const isCollapsed = Object.keys(expanded).length === 0

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
        <div className="flex flex-row gap-2 flex-wrap">
          <CollapseAllButton
            onToggle={handleCollapseAll}
            isCollapsed={isCollapsed}
          />
          <TableMultiSelectFilter
            label="Event"
            groups={[
              {
                title: 'Domain events',
                options: eventTypesByCategory.domain.map((type) => ({
                  label: type,
                  value: type,
                })),
              },
              {
                title: 'Registration events',
                options: eventTypesByCategory.registration.map((type) => ({
                  label: type,
                  value: type,
                })),
              },
              {
                title: 'Resolver events',
                options: eventTypesByCategory.resolver.map((type) => ({
                  label: type,
                  value: type,
                })),
              },
            ].filter((group) => group.options.length > 0)}
            selectedValues={selectedEventTypes}
            onChange={setSelectedEventTypes}
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
