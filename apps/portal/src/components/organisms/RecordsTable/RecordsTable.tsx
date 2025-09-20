import type { GetRecordsReturnType } from '@ensdomains/ensjs/public'
import { PopoverTrigger } from '@radix-ui/react-popover'
import {
  type Cell,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type Row,
  type RowSelectionState,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { SettingsIcon } from 'lucide-react'
import { type FC, type PropsWithChildren, useState } from 'react'
import { Popover, PopoverContent } from '@/components/ui/popover'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  type TableViewSettings,
  useTableViewSettings,
} from '@/features/profile/hooks/useTableViewSettings'
import { cn } from '@/lib/utils'
import { RecordDetails } from '../RecordDetails/RecordDetails'
import { columns, type Record } from './columns'
import { TableViewSwitch } from './TableViewSwitch'

type Entries<T> = {
  [K in keyof T]-?: [K, T[K]]
}[keyof T][]

export const recordsToTableData = (records: GetRecordsReturnType): Record[] => {
  const data: Record[] = []

  for (const [key, value] of Object.entries(
    records,
  ) as Entries<GetRecordsReturnType>) {
    if (key === 'contentHash' && value) {
      data.push({
        type: key,
        value: `${value.protocolType}://${value.decoded}`,
      })
    }
    if (key === 'texts') {
      for (const { key, value: text } of Object.values(value)) {
        data.push({ key, value: text, type: 'text' })
      }
    }
    if (key === 'coins') {
      for (const { coinType, value: addr, symbol } of Object.values(value)) {
        data.push({ key: symbol, value: addr, type: 'address', id: coinType })
      }
    }
  }

  return data
}

const RecordSidebar: FC<
  PropsWithChildren<{
    row: Row<Record> | null
    name: string
    open: boolean
    setOpen: React.Dispatch<React.SetStateAction<boolean>>
  }>
> = ({ children, row, name, open, setOpen }) => {
  return (
    <Sheet open={open} onOpenChange={setOpen} defaultOpen={false}>
      {children}
      <SheetContent side="right" className="sm:max-w-[880px] bg-white">
        {row && <RecordDetails record={row.original} name={name} />}
      </SheetContent>
    </Sheet>
  )
}

const ClickableCell = ({
  cell,
  toggleSidebar,
  setClickedRow,
  tableView,
}: {
  cell: Cell<Record, unknown>
  setClickedRow: React.Dispatch<React.SetStateAction<Row<Record> | null>>
  toggleSidebar: () => void
  tableView: TableViewSettings
}) => {
  if (cell.column.id === 'select') {
    return (
      <TableCell key={cell.id} className={tableView.compact ? 'py-2' : 'py-4'}>
        {flexRender(cell.column.columnDef.cell, cell.getContext())}
      </TableCell>
    )
  } else {
    return (
      <TableCell
        key={cell.id}
        className={tableView.compact ? 'py-2' : 'py-4'}
        onClick={() => {
          setClickedRow(cell.row)
          toggleSidebar()
        }}
      >
        {flexRender(cell.column.columnDef.cell, cell.getContext())}
      </TableCell>
    )
  }
}

export const RecordsTable = ({
  records,
  rowSelection,
  setRowSelection,
  defaultTableSettings,
  name,
}: {
  records: Record[]
  rowSelection: RowSelectionState
  setRowSelection: React.Dispatch<React.SetStateAction<RowSelectionState>>
  name: string
  defaultTableSettings?: TableViewSettings
}) => {
  const [sorting, setSorting] = useState<SortingState>([])
  const table = useReactTable({
    data: records,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
      rowSelection,
    },
    onRowSelectionChange: setRowSelection,
  })

  const [clickedRow, setClickedRow] = useState<Row<Record> | null>(null)

  const [open, setOpen] = useState(false)

  const [tableView] = useTableViewSettings(defaultTableSettings)

  return (
    <RecordSidebar row={clickedRow} {...{ name, open, setOpen }}>
      <Table className="relative">
        <Popover>
          <PopoverTrigger className="hidden sm:block absolute right-8 top-4 cursor-pointer">
            <SettingsIcon />
          </PopoverTrigger>
          <PopoverContent align="end">
            <TableViewSwitch />
          </PopoverContent>
        </Popover>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                className={cn(
                  'hover:bg-gray-200',
                  tableView.strippedRows && 'even:bg-gray-100',
                )}
                key={row.id}
                data-state={row.getIsSelected() && 'selected'}
              >
                {row.getVisibleCells().map((cell) => (
                  <ClickableCell
                    {...{ cell, setClickedRow, tableView }}
                    key={cell.id}
                    toggleSidebar={() => {
                      setOpen(!open)
                    }}
                  />
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </RecordSidebar>
  )
}
