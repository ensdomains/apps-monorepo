import type { GetRecordsReturnType } from '@ensdomains/ensjs/public'
import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { recordsToTableData } from '@/utils/records/recordsToTableData'

export const RecordCount = ({
  name,
  records,
}: {
  name: string
  records?: GetRecordsReturnType
}) => {
  const recordCount = useMemo(() => {
    if (records) return recordsToTableData(records).length
    else return 0
  }, [records])

  if (!records) return null

  return (
    <Link
      to="/$name/records"
      search={{ view: 'list' }}
      params={{ name }}
      className="w-full p-6 border border-gray-300 rounded-xl hover:bg-gray-100 duration-150"
    >
      <div className="flex flex-row justify-between items-center">
        <div>
          <h3 className="font-medium text-2xl">{recordCount}</h3>
          <p className="text-sm">records set</p>
        </div>
        <div className="h-8 w-8 p-2 rounded-sm bg-gray-100 flex items-center justify-center">
          <ChevronRight height={16} width={16} />
        </div>
      </div>
    </Link>
  )
}
