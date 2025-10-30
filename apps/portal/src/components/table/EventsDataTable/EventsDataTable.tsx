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
import { HistorySidebar } from '@/components/organisms/HistoryTable/HistorySidebar'
import { CollapseAllButton } from '@/components/table/CollapseAllButton'
import { TableDateRangeFilter } from '@/components/table/TableDateRangeFilter'
import { TableMultiSelectFilter } from '@/components/table/TableMultiSelectFilter'
import { createEventsColumns } from './createEventsColumns'
import { EventsTable } from './EventsTable'
import type { BaseEvent, EventsTableConfig, EventsTableData } from './types'

export const EventsDataTable = <TEvent extends BaseEvent = BaseEvent>({
  data,
  name,
  enableSidebar = true,
  enableFilters = true,
  enableSearch = true,
  defaultNetwork = { name: 'Sepolia', icon: '/icons/eth.svg' },
  onTransactionClick,
}: EventsTableConfig<TEvent>) => {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [expanded, setExpanded] = useState<ExpandedState>({})
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [clickedRow, setClickedRow] = useState<Row<
    EventsTableData<TEvent>
  > | null>(null)
  const [selectedEventTypes, setSelectedEventTypes] = useState<string[]>([])
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({})
  const [globalFilter, setGlobalFilter] = useState('')

  // Group event types by category for filters
  const eventTypesByCategory = useMemo(() => {
    const categories = new Map<string, Set<string>>()

    data.forEach((tx) => {
      tx.events.forEach((event) => {
        const category = event.category || 'other'
        if (!categories.has(category)) {
          categories.set(category, new Set())
        }
        categories.get(category)?.add(event.type)
      })
    })

    // Convert to the format expected by TableMultiSelectFilter
    return Array.from(categories.entries()).map(([category, types]) => ({
      title: `${category.charAt(0).toUpperCase() + category.slice(1)} events`,
      options: Array.from(types)
        .sort()
        .map((type) => ({
          label: type,
          value: type,
        })),
    }))
  }, [data])

  // Apply filters
  const filteredData = useMemo(() => {
    let filtered = data

    // Filter by event types
    if (selectedEventTypes.length > 0) {
      filtered = filtered.filter((tx) => {
        return tx.events.some((event) =>
          selectedEventTypes.includes(event.type),
        )
      })
    }

    // Filter by date range
    if (dateRange.from || dateRange.to) {
      filtered = filtered.filter((tx) => {
        if (!tx.timestamp) return false
        const txDate = new Date(Number(tx.timestamp) * 1000)
        if (dateRange.from && txDate < dateRange.from) {
          return false
        }
        if (dateRange.to) {
          const toEndOfDay = new Date(dateRange.to)
          toEndOfDay.setHours(23, 59, 59, 999)
          if (txDate > toEndOfDay) {
            return false
          }
        }
        return true
      })
    }

    return filtered
  }, [data, selectedEventTypes, dateRange])

  const columns = useMemo(
    () =>
      createEventsColumns<TEvent>({
        enableSidebar,
        defaultNetworkName: defaultNetwork.name,
        defaultNetworkIcon: defaultNetwork.icon,
      }),
    [enableSidebar, defaultNetwork.name, defaultNetwork.icon],
  )

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onExpandedChange: setExpanded,
    getExpandedRowModel: getExpandedRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    state: {
      sorting,
      columnFilters,
      expanded,
      globalFilter,
    },
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const searchValue = filterValue.toLowerCase()
      const tx = row.original

      // Search in transaction ID
      if (tx.transactionID.toLowerCase().includes(searchValue)) return true

      // Search in event types
      if (tx.events.some((e) => e.type.toLowerCase().includes(searchValue)))
        return true

      // Search in from address
      if (tx.from?.toLowerCase().includes(searchValue)) return true

      return false
    },
    meta: {
      onMoreClick: (row: Row<EventsTableData<TEvent>>) => {
        setClickedRow(row)
        setSidebarOpen(true)
        if (onTransactionClick) {
          onTransactionClick(row.original)
        }
      },
    },
  })

  const eventCount = data.length
  const searchId = useId()

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

        {enableSearch && (
          <div className="flex flex-row gap-2 w-full bg-white rounded-sm p-2 h-10">
            <label htmlFor={searchId} aria-label="Search history">
              <SearchIcon />
            </label>
            <input
              id={searchId}
              className="w-full"
              placeholder="Search transactions..."
              onChange={(event) => table.setGlobalFilter(event.target.value)}
            />
          </div>
        )}

        {enableFilters && (
          <div className="flex flex-row gap-2 flex-wrap">
            <CollapseAllButton
              onToggle={handleCollapseAll}
              isCollapsed={isCollapsed}
            />
            <TableDateRangeFilter
              label="Date"
              dateRange={dateRange}
              onChange={setDateRange}
            />
            {eventTypesByCategory.length > 0 && (
              <TableMultiSelectFilter
                label="Event"
                groups={eventTypesByCategory}
                selectedValues={selectedEventTypes}
                onChange={setSelectedEventTypes}
              />
            )}
          </div>
        )}
      </header>

      {enableSidebar ? (
        <HistorySidebar
          row={clickedRow as Row<EventsTableData> | null}
          name={name}
          open={sidebarOpen}
          setOpen={setSidebarOpen}
        >
          <EventsTable<TEvent> table={table} />
        </HistorySidebar>
      ) : (
        <EventsTable<TEvent> table={table} />
      )}
    </>
  )
}
