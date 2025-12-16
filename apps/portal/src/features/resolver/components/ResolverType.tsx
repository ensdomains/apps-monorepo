import { useQuery } from '@tanstack/react-query'
import { FocusIcon } from 'lucide-react'
import type { Address } from 'viem/accounts'
import { LoadingSpinner } from '@/components/molecules/LoadingSpinner'
import { getSupportsInterfacesQueryOptions } from '@/hooks/useSupportsInterfaces'
import { RESOLVER_INTERFACE_IDS } from '@/lib/constants/resolverInterfaceIds'

interface InterfaceCheckProps {
  resolverAddress: Address
}

const InterfaceCheck = ({ resolverAddress }: InterfaceCheckProps) => {
  const {
    data: supportsInterfaces,
    isLoading,
    error,
  } = useQuery(
    getSupportsInterfacesQueryOptions({
      address: resolverAddress,
      interfaces: [RESOLVER_INTERFACE_IDS.DedicatedResolver],
    }),
  )

  if (isLoading) <LoadingSpinner title="Loading..." />

  if (error) return <>{error.cause?.message}</>

  if (!supportsInterfaces || supportsInterfaces.every((v) => v === false))
    return null

  if (supportsInterfaces[0]) {
    return (
      <div className="flex flex-row p-4 sm:p-6 gap-4 sm:gap-6 rounded-2xl border border-gray-300 w-full flex-1 items-center">
        <FocusIcon className="size-10" />
        <div className="flex flex-col">
          <span className="font-medium">Type</span>
          <span>DedicatedResolver</span>
        </div>
      </div>
    )
  }
}

interface ResolverTypeProps {
  resolverAddress: Address
}

export const ResolverType = ({ resolverAddress }: ResolverTypeProps) => {
  // TODO: temp hardcoded PublicResolver address
  if (resolverAddress === '0x0e14eE0592da66Bb4c8a8090066BC8A5Af15f3E6') {
    return (
      <div className="flex flex-row p-6 gap-6 rounded-2xl border border-gray-300 w-full flex-1 items-center">
        <FocusIcon className="size-10" />
        <div className="flex flex-col">
          <span className="font-medium">Type</span>
          <span>PublicResolver</span>
        </div>
      </div>
    )
  }
  return <InterfaceCheck resolverAddress={resolverAddress} />
}
