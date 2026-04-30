import { ExternalLink } from 'react-external-link'
import type { Address } from 'viem'
import { AssuredWorkloadIcon } from '@/assets/icons'
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
      <div className="flex items-start gap-3 p-6 self-stretch rounded-sm bg-message-success-fill">
        <AssuredWorkloadIcon className="size-6 shrink-0 text-message-success-text mt-0.5" />
        <div className="flex flex-col gap-1">
          <span
            className="font-[350] leading-none tracking-[-0.6px]"
            style={{
              color: 'var(--message-success-text, #105C23)',
              fontSize: 'var(--3xl, 30px)',
            }}
          >
            ENS Permissioned Resolver
          </span>
          <p className="text-sm text-message-success-text">
            This resolver is an instance of the official{' '}
            <ExternalLink
              className="underline decoration-dashed underline-offset-4"
              href="https://github.com/ensdomains/contracts-v2/blob/main/contracts/src/resolver/PermissionedResolver.sol"
            >
              ENS Permissioned Resolver
            </ExternalLink>
            . This resolver has been audited and is considered secure.
          </p>
        </div>
      </div>
    )
  return null
}
