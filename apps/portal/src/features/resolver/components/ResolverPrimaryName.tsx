import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem/accounts'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { getResolverNameQueryOptions } from '../hooks/useResolverName'

export const ResolverPrimaryName = ({
  resolverAddress,
}: {
  resolverAddress: Address
}) => {
  const { data, isLoading, error } = useQuery(
    getResolverNameQueryOptions({ resolverAddress }),
  )

  if (isLoading) return 'Loading...'

  if (error) return <>{error.cause?.message}</>

  if (!data) return null

  return (
    <div className="flex flex-row p-6 gap-6 rounded-2xl border border-secondary w-full flex-1">
      <NameAvatar name={data} height="40px" width="40px" />
      <div className="flex flex-col">
        <span className="font-medium">Primary Name</span>
        <span>{data}</span>
      </div>
    </div>
  )
}
