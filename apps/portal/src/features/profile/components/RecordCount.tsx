import type { GetRecordsReturnType } from '@ensdomains/ensjs/public'
import { Link } from '@tanstack/react-router'
import { ChevronRight, FileCodeIcon, ListIcon } from 'lucide-react'
import { useMemo } from 'react'
import type { Address } from 'viem'
import { CopyableRecord } from '@/components/molecules/CopyableRecord'
import { LoadingSpinner } from '@/components/molecules/LoadingSpinner'
import { recordsToTableData } from '@/utils/records/recordsToTableData'

export const RecordCount = ({
  name,
  records,
  resolverAddress,
}: {
  name: string
  records?: GetRecordsReturnType
  resolverAddress: Address
}) => {
  const recordCount = useMemo(() => {
    if (records) return recordsToTableData(records).length
    else return 0
  }, [records])

  if (!records) return null

  return (
    <div className="flex flex-col rounded-2xl overflow-hidden  border border-gray-300 ">
      <div className="w-full p-6 border-b border-b-gray-300 flex flex-row items-center gap-6">
        <ListIcon
          height={24}
          width={24}
          className="p-2 w-8 h-8 rounded-4xl bg-secondary"
        />
        <div>
          <span className="font-medium">{recordCount}</span> records set
        </div>
      </div>
      <div className="w-full p-6 duration-150 flex flex-row gap-6 items-center">
        <FileCodeIcon
          height={24}
          width={24}
          className="p-2 w-8 h-8 rounded-4xl bg-secondary"
        />
        <div className="flex-1">
          <span className="font-medium">Resolver</span>
          <CopyableRecord
            displayValue={`${resolverAddress.slice(0, 6)}...${resolverAddress.slice(-4)}`}
            value={resolverAddress}
          />
        </div>
        <Link
          to="/$name/records"
          search={{ view: 'list' }}
          params={{ name }}
          className="h-8 w-8 p-2 rounded-sm duration-150 bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
        >
          <ChevronRight height={16} width={16} />
        </Link>
      </div>
    </div>
  )
}
