import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight, HashIcon, ListIcon } from 'lucide-react'
import { type Address, zeroAddress } from 'viem'
import { getUnderlyingAddressQueryOptions } from '@/features/resolver/hooks/useUnderlyingResolver'

interface RolesCountProps {
  name: string
  resolverAddress?: Address
}

export const RolesCount = ({
  name,
  resolverAddress = zeroAddress,
}: RolesCountProps) => {
  const { data, isLoading, error } = useQuery({
    ...getUnderlyingAddressQueryOptions({ resolverAddress, name }),
    enabled: Boolean(resolverAddress && resolverAddress !== zeroAddress),
  })

  if (error)
    return <div>Failed to get underlying resolver: {error.cause?.message}</div>
  if (isLoading) return <div>Loading...</div>

  if (!data) return <div>Could not find resolver location</div>

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
          <span className="font-medium">0</span> roles
        </div>
      </div>
      <div className="w-full p-6 duration-150 flex flex-row gap-6 items-center">
        <HashIcon
          height={24}
          width={24}
          className="p-2 w-8 h-8 rounded-4xl bg-secondary"
        />
        <div className="flex-1">
          <div className="font-medium">Network</div>
          <div>{data[0] !== zeroAddress && data[1] ? 'ENSv2' : 'ENSv1'}</div>
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
