import type { GetRecordsReturnType } from "@ensdomains/ensjs/public"
import { Link } from "@tanstack/react-router"
import type { RowSelectionState } from "@tanstack/react-table"
import { FileInputIcon, PencilLineIcon, SearchIcon, TrashIcon, XIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { RecordsTable } from "@/components/organisms/RecordsTable/RecordsTable"
import { Button } from "@/components/ui/button"
import { useCanEditRecords } from "@/features/profile/hooks/useCanEditRecords"

export const RecordList = ({ name, records }: { name: string; records: GetRecordsReturnType; view: 'list' | 'edit' }) => {
  const { data: canEditRecords } = useCanEditRecords({ name })

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  const rowCount = useMemo(
    () => Object.keys(rowSelection).length,
    [rowSelection],
  )

  return <>
    <header className="bg-gray-100 px-8 pb-4 pt-12 flex flex-col gap-4">
      <div className="flex flex-row justify-between">
        <h1 className="text-[28px] font-medium">Records</h1>
        {canEditRecords && (
          <Link from="/$name/records" search={{ view: 'edit' }}>
            <Button
              variant="secondary"
              disabled={rowCount > 0}
              type="button"
            >
              <PencilLineIcon height={24} width={24} />
              Edit Records
            </Button></Link>
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
              <XIcon height={24} width={24} />
            </button>
            {rowCount} selected
          </span>
          <div className="flex flex-row gap-2">
            <Button variant="secondary">
              <PencilLineIcon height={24} width={24} /> Edit
            </Button>
            <Button variant="secondary">
              <FileInputIcon height={24} width={24} /> Export
            </Button>
            <Button variant="secondary">
              <TrashIcon height={24} width={24} /> Delete
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-row gap-2 w-full bg-white  rounded-sm p-2 h-10">
          <label htmlFor="search-records" aria-label="Search records">
            <SearchIcon />
          </label>
          <input
            id="search-records"
            className="w-full "
            placeholder="Search records..."
          />
        </div>
      )}
    </header>
    <RecordsTable
      name={name}
      records={records}
      {...{ rowSelection, setRowSelection }}
    /></>
}