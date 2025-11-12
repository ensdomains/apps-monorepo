import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { Address } from 'viem'
import { NamechainSVG } from '@/assets/chains'
import { LoadingSpinner } from '@/components/molecules/LoadingSpinner'
import { getUnderlyingAddressQueryOptions } from '@/features/resolver/hooks/useUnderlyingResolver'

export const ResolverLocation = ({
  name,
  resolverAddress,
}: {
  name: string
  resolverAddress: Address
}) => {
  const { data, isLoading, error } = useQuery(
    getUnderlyingAddressQueryOptions({ resolverAddress, name }),
  )

  if (error)
    return <div>Failed to get underlying resolver: {error.cause?.message}</div>
  if (isLoading) return <div>Loading...</div>
  if (isLoading) return <LoadingSpinner title="Loading..." />

  if (!data) return <div>Could not find resolver location</div>

  return (
    <Link
      to="/$name/resolver"
      params={{ name }}
      className="w-full p-6 border border-gray-300 rounded-xl hover:bg-gray-100 duration-150"
    >
      <div className="flex flex-row justify-between items-center">
        <div>
          <span className="font-medium">Network</span>
          <h3>{data[1] ? 'Namechain' : 'Sepolia'}</h3>
        </div>
        <NamechainSVG height={40} width={40} />
      </div>
    </Link>
  )
}
