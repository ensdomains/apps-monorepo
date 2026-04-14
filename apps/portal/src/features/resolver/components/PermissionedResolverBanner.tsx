import { ShieldCheckIcon } from 'lucide-react'
import { ExternalLink } from 'react-external-link'
import type { Address } from 'viem'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useIsPermissionedResolver } from '@/features/resolver/hooks/useIsPermissionedResolver'

export const PermissionedResolverBanner = ({
  resolverAddress,
}: {
  resolverAddress: Address
}) => {
  const {
    data: isPermissionedResolver,
    isLoading,
    error,
  } = useIsPermissionedResolver({
    resolverAddress,
  })

  if (error)
    return <>{error instanceof Error ? error.message : 'Failed to load data'}</>

  if (isLoading) return 'Loading...'

  if (isPermissionedResolver)
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
            href="https://github.com/ensdomains/contracts-v2/blob/main/contracts/src/resolver/PermissionedResolver.sol"
          >
            ENS Permissioned Resolver
          </ExternalLink>
          . This resolver has been audited and is considered secure.
        </AlertDescription>
      </Alert>
    )
  return null
}
