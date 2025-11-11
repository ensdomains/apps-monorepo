import { useQuery } from '@tanstack/react-query'
import { ShieldCheckIcon } from 'lucide-react'
import { ExternalLink } from 'react-external-link'
import type { Address } from 'viem'
import { getSupportsInterfacesQueryOptions } from '@/hooks/useSupportsInterfaces'
import { RESOLVER_INTERFACE_IDS } from '@/lib/constants/resolverInterfaceIds'

export const DedicatedResolverBanner = ({
  resolverAddress,
}: {
  resolverAddress: Address
}) => {
  const {
    data: isDedicatedResolver,
    isLoading,
    error,
  } = useQuery(
    getSupportsInterfacesQueryOptions({
      address: resolverAddress,
      interfaces: [RESOLVER_INTERFACE_IDS.DedicatedResolver],
    }),
  )

  if (error) return <>{error.cause?.message}</>

  if (isLoading) return 'Loading...'

  if (isDedicatedResolver?.[0])
    return (
      <div className="flex flex-col p-4 sm:p-6 gap-4 text-sm sm:text-base items-center rounded-2xl bg-secondary">
        <ShieldCheckIcon className="size-6" />
        <p>
          This resolver is an instance of the official{' '}
          <ExternalLink
            className="underline decoration-dashed underline-offset-4"
            href="https://github.com/ensdomains/namechain/blob/main/contracts/src/common/resolver/DedicatedResolver.sol"
          >
            ENS Dedicated Resolver
          </ExternalLink>
          . This resolver has been audited and is considered secure.
        </p>
      </div>
    )
  return null
}
