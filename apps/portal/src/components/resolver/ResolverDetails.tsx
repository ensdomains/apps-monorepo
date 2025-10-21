import type { Address } from 'viem'
import { useChainId } from 'wagmi'
import { useSupportsInterfaces } from '@/hooks/useSupportsInterfaces'
import {
  RESOLVER_FEATURE_NAMES,
  RESOLVER_INTERFACE_IDS,
  type ResolverInterfaceName,
} from '@/lib/constants/resolverInterfaceIds'
import { Datapoint, type DatapointProps } from '../molecules/Datapoint'
import { ResolverField } from './ResolverField'

const SupportedFeatures = ({
  resolverAddress,
}: {
  resolverAddress: Address
}) => {
  const {
    data: supportsInterfaces,
    error,
    isLoading,
  } = useSupportsInterfaces({
    address: resolverAddress,
    interfaces: Object.values(RESOLVER_INTERFACE_IDS),
  })

  const supportedInterfaceIds = Object.keys(RESOLVER_INTERFACE_IDS)
    .filter((_, index) => supportsInterfaces?.[index])
    .map(
      (name) => RESOLVER_FEATURE_NAMES[name as ResolverInterfaceName] || name,
    )

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>
  if (!supportsInterfaces) return <div>No data</div>

  return (
    <div className="flex flex-col gap-2 w-full">
      <span className="font-sans font-normal text-sm text-gray-500">
        Interfaces
      </span>
      <div className="flex flex-row flex-wrap gap-x-4 gap-y-2">
        {supportedInterfaceIds.map((feature) => (
          <div
            key={feature}
            className="text-sm sm:text-base font-normal underline underline-offset-2 decoration-dotted cursor-pointer"
          >
            {feature}
          </div>
        ))}
      </div>
    </div>
  )
}

export const ResolverDetails = ({
  resolverAddress,
  data,
}: {
  resolverAddress: Address
  data: DatapointProps[]
}) => {
  return (
    <div className="flex flex-col gap-6 p-6 border border-gray-200 rounded-lg w-full">
      <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-y-1 sm:gap-y-4 gap-x-40">
        {data.map((item) => (
          <Datapoint key={item.label} {...item} />
        ))}
      </div>
      <div className="border-t border-t-gray-200 h-[1px]"></div>
      <SupportedFeatures resolverAddress={resolverAddress} />
    </div>
  )
}
