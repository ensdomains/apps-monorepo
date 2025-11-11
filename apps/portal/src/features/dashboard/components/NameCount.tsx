import { useQuery } from '@tanstack/react-query'
import { ChevronRightIcon } from 'lucide-react'
import type { Address } from 'viem/accounts'
import { LoadingSpinner } from '@/components/molecules/LoadingSpinner'
import { getNamesForAddressQueryOptions } from '../hooks/useNamesForAddress'

export const NameCount = ({ address }: { address: Address }) => {
  const {
    data: names,
    isLoading,
    error,
  } = useQuery(getNamesForAddressQueryOptions({ address }))

  if (error) {
    if (error._tag === 'Wagmi/ClientError')
      return <div>Error connecting to Ethereum</div>
    return <div>Error: {error.cause?.message}</div>
  }
  if (isLoading) return <LoadingSpinner title="Loading..." />

  return (
    <div className="flex flex-row justify-between items-center w-full p-6 rounded-lg border border-gray-300 hover:bg-gray-100 duration-150">
      <div className="flex flex-col w-full">
        <div className="font-medium text-[26px]">{names?.length}</div>
        <div className="leading-none">names owned</div>
      </div>
      <div className="h-8 w-8 p-2 rounded-sm bg-gray-100 flex items-center justify-center">
        <ChevronRightIcon className="size-4" />
      </div>
    </div>
  )
}
