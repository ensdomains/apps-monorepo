import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { getSubnamesQueryOptions } from '../hooks/useSubnames'

export const SubnameCount = ({ name }: { name: string }) => {
  const { data, isLoading, error } = useQuery(getSubnamesQueryOptions({ name }))

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
          <h3 className="font-medium text-2xl">{data.length}</h3>
          <p className="text-sm">subnames</p>
        </div>
        <div className="h-8 w-8 p-2 rounded-sm bg-gray-100 flex items-center justify-center">
          <ChevronRight height={16} width={16} />
        </div>
      </div>
    </Link>
  )
}
