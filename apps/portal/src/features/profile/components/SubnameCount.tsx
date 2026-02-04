import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight, ListIcon, ListStartIcon } from 'lucide-react'
import type { Address } from 'viem'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { sepoliaWithEns } from '@/lib/wagmi'
import type { WithEnsNetwork } from '@/utils/types'
import { getSubnamesQueryOptions } from '../hooks/useSubnames'
import { RegistryLocation } from './RegistryLocation'

const v1EnsRegistry = sepoliaWithEns.contracts.ensRegistry.address

export const SubnameCount = ({
  name,
  registryAddress,
  network,
}: WithEnsNetwork<{
  name: string
  registryAddress?: Address
}>) => {
  const { data, isLoading, error } = useQuery(
    getSubnamesQueryOptions({ name, network }),
  )

  if (error) return <div>Error: {error.cause?.message}</div>
  if (isLoading) return <LoadingSpinner title="Loading..." />

  return (
    <div className="flex flex-col rounded-2xl overflow-hidden  border border-gray-300 ">
      <div className="w-full p-6 border-b border-b-gray-300 flex flex-row items-center gap-6">
        <ListIcon
          height={24}
          width={24}
          className="p-2 w-8 h-8 rounded-4xl bg-secondary"
        />
        <div className="flex-1">
          <span className="font-medium">{data ? data.length : 0}</span> subnames
        </div>
        <Link
          to="/$name/subnames"
          params={{ name }}
          className="h-8 w-8 p-2 rounded-sm duration-150 bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
        >
          <ChevronRight height={16} width={16} />
        </Link>
      </div>
      <div className="w-full p-6 duration-150 flex flex-row gap-6 items-center">
        <ListStartIcon
          height={24}
          width={24}
          className="p-2 w-8 h-8 rounded-4xl bg-secondary"
        />
        {registryAddress && registryAddress !== v1EnsRegistry ? (
          <RegistryLocation name={name} registryAddress={registryAddress} />
        ) : (
          <div className="flex-1">
            <span className="font-medium">Subregistry</span>
            <div>None set</div>
          </div>
        )}
        <Link
          to="/$name/registry"
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
