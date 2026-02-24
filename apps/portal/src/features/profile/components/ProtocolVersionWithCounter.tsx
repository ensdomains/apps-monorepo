import { makeLabelNodeAndParent } from '@ensdomains/ensjs/utils'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight, HashIcon, ListIcon } from 'lucide-react'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { getBurnedFuseCountQueryOptions } from '@/features/namewrapper/hooks/useBurnedFuseCount'
import { getNameRolesAccountsQueryOptions } from '@/features/roles/hooks/useNameRoleAccounts'
import { namechainEthRegistryAddress } from '@/lib/constants/registry'
import type { EnsNetworkName } from '@/utils/types'

interface ProtocolVersionWithCounterProps {
  name: string
  network: EnsNetworkName
}

const RoleCount = ({ name }: { name: string }) => {
  const { data, isLoading, error } = useQuery(
    getNameRolesAccountsQueryOptions({
      ...makeLabelNodeAndParent(name),
      registryAddress: namechainEthRegistryAddress,
      fromBlock: 9782822n,
    }),
  )

  if (error)
    return <div>Failed to fetch fuses count: {error.cause?.message}</div>
  if (isLoading) return <LoadingSpinner />

  return (
    <div className="w-full p-6 border-b border-b-gray-300 flex flex-row items-center gap-6">
      <ListIcon
        height={24}
        width={24}
        className="p-2 w-8 h-8 rounded-4xl bg-citrine-100 text-citrine-500"
      />
      <div className="flex-1">
        <span className="font-medium">{(data || { size: 0 }).size}</span> roles
      </div>
      <Link
        to="/$name/roles"
        params={{ name }}
        className="h-8 w-8 p-2 rounded-sm duration-150 bg-secondary hover:bg-secondary/80 text-secondary-foreground flex items-center justify-center"
      >
        <ChevronRight height={16} width={16} />
      </Link>
    </div>
  )
}

const FuseCount = ({ name }: { name: string }) => {
  const { data, isLoading, error } = useQuery(
    getBurnedFuseCountQueryOptions({ name }),
  )

  if (error)
    return <div>Failed to fetch fuses count: {error.cause?.message}</div>
  if (isLoading) return <LoadingSpinner />

  return (
    <div className="w-full p-6 border-b border-b-gray-300 flex flex-row items-center gap-6">
      <ListIcon
        height={24}
        width={24}
        className="p-2 w-8 h-8 rounded-4xl bg-citrine-100 text-citrine-500"
      />
      <div className="flex-1">
        <span className="font-medium">{data || 0}</span> fuses burned
      </div>
      <Link
        to="/$name/ownership"
        params={{ name }}
        className="h-8 w-8 p-2 rounded-sm duration-150 bg-secondary hover:bg-secondary/80 text-secondary-foreground flex items-center justify-center"
      >
        <ChevronRight height={16} width={16} />
      </Link>
    </div>
  )
}

export const ProtocolVersionWithCounter = ({
  name,
  network,
}: ProtocolVersionWithCounterProps) => {
  return (
    <div className="flex flex-col rounded-2xl overflow-hidden  border border-gray-300 ">
      {network === 'sepolia' ? (
        <FuseCount name={name} />
      ) : (
        <RoleCount name={name} />
      )}
      <div className="w-full p-6 duration-150 flex flex-row gap-6 items-center">
        <HashIcon
          height={24}
          width={24}
          className="p-2 w-8 h-8 rounded-4xl bg-citrine-100 text-citrine-500"
        />
        <div className="flex-1">
          <div className="font-medium">Protocol</div>
          <div>{network === 'namechainSepolia' ? 'ENSv2' : 'ENSv1'}</div>
        </div>
        <Link
          to="/$name/records"
          search={{ view: 'list' }}
          params={{ name }}
          className="h-8 w-8 p-2 rounded-sm duration-150 bg-secondary hover:bg-secondary/80 text-secondary-foreground flex items-center justify-center"
        >
          <ChevronRight height={16} width={16} />
        </Link>
      </div>
    </div>
  )
}
