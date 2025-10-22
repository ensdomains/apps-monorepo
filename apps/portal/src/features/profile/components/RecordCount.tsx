import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { recordsToTableData } from '@/utils/records/recordsToTableData'
import { getProfileQueryOptions } from '../hooks/useProfile'

export const RecordCount = ({ name }: { name: string }) => {
  const { data, isLoading, error } = useQuery(getProfileQueryOptions(name))

  const recordCount = useMemo(() => {
    if (data) return recordsToTableData(data.records).length
    else return 0
  }, [data])

  if (error) return <div>Error: {error.message}</div>
  if (isLoading) return <div>Loading...</div>

  if (!data) return null

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
