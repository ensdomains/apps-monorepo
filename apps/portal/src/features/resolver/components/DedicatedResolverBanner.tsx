import { useQuery } from '@tanstack/react-query'
import { ShieldCheckIcon } from 'lucide-react'
import { ExternalLink } from 'react-external-link'
import type { Address } from 'viem'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
      <Alert
        variant="success"
        className="flex flex-col items-center gap-3 border-none p-8 [&>svg]:size-6"
      >
        <ShieldCheckIcon />
        <AlertDescription className="block text-center">
          This resolver is an instance of the official{' '}
          <ExternalLink
            className="underline decoration-dashed underline-offset-4"
            href="https://github.com/ensdomains/contracts-v2/blob/main/contracts/src/resolver/OwnedResolver.sol"
          >
            ENS Dedicated Resolver
          </ExternalLink>
          . This resolver has been audited and is considered secure.
        </AlertDescription>
      </Alert>
    )
  return null
}
