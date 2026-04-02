import { ExternalLink } from 'react-external-link'
import type { Address } from 'viem'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useSupportsInterfaces } from '@/hooks/useSupportsInterfaces'
import {
  RESOLVER_FEATURES,
  RESOLVER_INTERFACE_IDS,
  type ResolverInterfaceName,
} from '@/lib/constants/resolverInterfaceIds'
import { Datapoint, type DatapointProps } from '../../../components/Datapoint'

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

  const supportedInterfaces = Object.keys(RESOLVER_INTERFACE_IDS)
    .filter((_, index) => supportsInterfaces?.[index])
    .map((name) => {
      const interfaceName = name as ResolverInterfaceName
      return RESOLVER_FEATURES[interfaceName]
    })
    .filter((feature) => feature?.name && feature?.link)

  if (isLoading) return <LoadingSpinner title="Loading..." />
  if (error) return <div>Error: {error.message}</div>
  if (!supportsInterfaces) return <div>No data</div>

  return (
    <div className="flex flex-col gap-2 w-full">
      <span className="font-sans font-normal text-sm text-muted-foreground">
        Interfaces
      </span>
      <div className="flex flex-row flex-wrap gap-x-4 gap-y-2">
        {supportedInterfaces.map((feature) => (
          <ExternalLink
            key={feature.name}
            href={feature.link}
            className="text-sm sm:text-base font-normal underline underline-offset-2 decoration-dotted hover:text-primary transition-colors"
          >
            {feature.name}
          </ExternalLink>
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
    <div className="flex flex-col gap-6 p-6 border border-border rounded-lg w-full">
      <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-y-1 sm:gap-y-4 gap-x-40">
        {data.map((item) => (
          <Datapoint key={item.label} {...item} />
        ))}
      </div>
      <div className="border-t border-t-border h-px"></div>
      <SupportedFeatures resolverAddress={resolverAddress} />
    </div>
  )
}
