import { useQuery } from '@tanstack/react-query'
import { FocusIcon } from 'lucide-react'
import type { Address } from 'viem/accounts'
import { getSupportsInterfacesQueryOptions } from '@/hooks/useSupportsInterfaces'
import { RESOLVER_INTERFACE_IDS } from '@/lib/constants/resolverInterfaceIds'

const InterfaceCheck = ({ resolverAddress }: { resolverAddress: Address }) => {
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

  if (isLoading) return 'Loading...'

  if (error) return <>{error.cause?.message}</>

  if (!supportsInterfaces || supportsInterfaces.every((v) => v === false))
    return null

  if (supportsInterfaces[0]) {
    return (
      <div className="flex flex-row p-6 gap-6 rounded-2xl border border-secondary w-full flex-1 items-center">
        <FocusIcon height={40} width={40} />
        <div className="flex flex-col">
          <span className="font-medium">Type</span>
          <span>DedicatedResolver</span>
        </div>
      </div>
    )
  }
}

export const ResolverType = ({
  resolverAddress,
}: {
  resolverAddress: Address
}) => {
  // TODO: temp hardcoded PublicResolver address
  if (resolverAddress === '0x0e14eE0592da66Bb4c8a8090066BC8A5Af15f3E6') {
    return (
      <div className="flex flex-row p-6 gap-6 rounded-2xl border border-secondary w-full flex-1 items-center">
        <FocusIcon height={40} width={40} />
        <div className="flex flex-col">
          <span className="font-medium">Type</span>
          <span>PublicResolver</span>
        </div>
      </div>
    )
  }
  return <InterfaceCheck resolverAddress={resolverAddress} />
}
