import type { GetRecordsReturnType } from '@ensdomains/ensjs/public'
import { Link } from '@tanstack/react-router'
import {
  type ColumnFiltersState,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type RowSelectionState,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import {
  FileInputIcon,
  PencilLineIcon,
  Search,
  TrashIcon,
  XIcon,
} from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { columns } from '@/features/records/components/RecordsTable/columns'
import { RecordsTable } from '@/features/records/components/RecordsTable/RecordsTable'
import { useCanEditRecords } from '@/features/records/hooks/useCanEditRecords'
import { recordsToTableData } from '@/utils/records/recordsToTableData'

export const RecordList = ({
  name,
  records: rawRecords,
}: {
  name: string
  records: GetRecordsReturnType
  view: 'list' | 'edit'
}) => {
  const { data: canEditRecords } = useCanEditRecords({ name })

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  const rowCount = useMemo(
    () => Object.keys(rowSelection).length,
    [rowSelection],
  )

  const [sorting, setSorting] = useState<SortingState>([])
  const records = useMemo(() => recordsToTableData(rawRecords), [rawRecords])

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const table = useReactTable({
    data: records,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
      rowSelection,
      columnFilters,
    },
    onRowSelectionChange: setRowSelection,
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: 'includesString',
  })

  const recordCount = records.length

  const searchRecordsId = useId()

  return (
    <>
      <header className="bg-gray-100 px-8 pb-4 pt-12 flex flex-col gap-4">
        <div className="flex flex-row justify-between">
          <h1 className="text-[28px] font-medium">{recordCount} Records</h1>
          {canEditRecords && (
            <Link from="/$name/records" search={{ view: 'edit' }}>
              <Button variant="secondary" disabled={rowCount > 0} type="button">
                <PencilLineIcon className="size-6" />
                Records
              </Button>
            </Link>
          )}
        </div>
        {rowCount > 0 ? (
          <div className="flex flex-row w-full justify-between h-10">
            <span className="flex flex-row items-center gap-1">
              <button
                type="button"
                className="cursor-pointer"
                onClick={() => setRowSelection({})}
              >
                <XIcon className="size-6" />
              </button>
              {rowCount} selected
            </span>
            <div className="flex flex-row gap-2">
              <Button variant="secondary">
                <PencilLineIcon className="size-6" /> Edit
              </Button>
              <Button variant="secondary">
                <FileInputIcon className="size-6" /> Export
              </Button>
              <Button variant="secondary">
                <TrashIcon className="size-6" /> Delete
              </Button>
            </div>
          </div>
        ) : (
          <InputGroup className="bg-white rounded-sm">
            <InputGroupInput
              id={searchRecordsId}
              className="w-full"
              placeholder="Search records..."
              onChange={(event) => table.setGlobalFilter(event.target.value)}
            />
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
          </InputGroup>
        )}
      </header>
      <RecordsTable
        name={name}
        table={table}
        {...{ rowSelection, setRowSelection }}
      />
    </>
  )
}
