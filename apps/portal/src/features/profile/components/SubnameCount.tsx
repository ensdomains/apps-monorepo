import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight, ListIcon, ListStartIcon } from 'lucide-react'
import { zeroAddress } from 'viem'
import { CopyableRecord } from '@/components/molecules/CopyableRecord'
import { LoadingSpinner } from '@/components/molecules/LoadingSpinner'
import { getNameRegistriesQueryOptions } from '@/features/registry/hooks/useNameRegistries'
import { getSubnamesQueryOptions } from '../hooks/useSubnames'

const RegistryLocation = ({ name }: { name: string }) => {
  const { data, isLoading, error } = useQuery(
    getNameRegistriesQueryOptions({ name }),
  )

  if (error) return <div>{error.cause?.message}</div>
  if (isLoading) return <div>Loading...</div>

  if (!data) return null

  const lastLabel = data[0]

  const hasSubregistry = lastLabel && lastLabel !== zeroAddress

  return (
    <div className="flex-1">
      <span className="font-medium">Subregistry</span>

      {hasSubregistry ? (
        <CopyableRecord
          displayValue={`${lastLabel.slice(0, 6)}...${lastLabel.slice(-4)}`}
          value={lastLabel}
        />
      ) : (
        <div>No subregistry</div>
      )}
    </div>
  )
}

export const SubnameCount = ({ name }: { name: string }) => {
  const { data, isLoading, error } = useQuery(getSubnamesQueryOptions({ name }))

  if (error) return <div>Error: {error.cause?.message}</div>
  if (isLoading) return <div>Loading...</div>
  if (isLoading) return <LoadingSpinner title="Loading..." />

  if (!data) return null

  return (
    <div className="flex flex-col rounded-2xl overflow-hidden  border border-gray-300 ">
      <div className="w-full p-6 border-b border-b-gray-300 flex flex-row items-center gap-6">
        <ListIcon
          height={24}
          width={24}
          className="p-2 w-8 h-8 rounded-4xl bg-secondary"
        />
        <div>
          <span className="font-medium">{data.length}</span> subnames
        </div>
      </div>
      <div className="w-full p-6 duration-150 flex flex-row gap-6 items-center">
        <ListStartIcon
          height={24}
          width={24}
          className="p-2 w-8 h-8 rounded-4xl bg-secondary"
        />
        <RegistryLocation name={name} />
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
