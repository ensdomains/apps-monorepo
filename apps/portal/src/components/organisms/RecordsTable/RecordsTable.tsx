import type { GetRecordsReturnType } from '@ensdomains/ensjs/public'
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
import { type FC, type PropsWithChildren, useMemo, useState } from 'react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RecordDetails } from '../RecordDetails/RecordDetails'
import { columns, type Record } from './columns'

type Entries<T> = {
  [K in keyof T]-?: [K, T[K]]
}[keyof T][]

const recordsToTableData = (records: GetRecordsReturnType) => {
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
      for (const { name, value: addr, id } of Object.values(value)) {
        data.push({ key: name, value: addr, type: 'address', id })
      }
    }
  }

  return data
}

const RecordSidebar: FC<
  PropsWithChildren<{ row: Row<Record> | null; name: string; open: boolean, setOpen: React.Dispatch<React.SetStateAction<boolean>> }>
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
}: {
  cell: Cell<Record, unknown>
  setClickedRow: React.Dispatch<React.SetStateAction<Row<Record> | null>>
  toggleSidebar: () => void
}) => {
  if (cell.column.id === 'select') {
    return (
      <TableCell key={cell.id}>
        {flexRender(cell.column.columnDef.cell, cell.getContext())}
      </TableCell>
    )
  } else {
    return (
      <TableCell
        key={cell.id}
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
  name,
}: {
  records: GetRecordsReturnType
  rowSelection: RowSelectionState
  setRowSelection: React.Dispatch<React.SetStateAction<RowSelectionState>>
  name: string
}) => {
  const tableData = useMemo(() => recordsToTableData(records), [records])

  const [sorting, setSorting] = useState<SortingState>([])
  const table = useReactTable({
    data: tableData,
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

  return (
    <RecordSidebar row={clickedRow}  {...{ name, open, setOpen }} >
      <Table>
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
                className="hover:bg-secondary"
                key={row.id}
                data-state={row.getIsSelected() && 'selected'}
              >
                {row.getVisibleCells().map((cell) => (
                  <ClickableCell {...{ cell, setClickedRow }} key={cell.id} toggleSidebar={() => {
                    setOpen(!open)
                  }} />
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
