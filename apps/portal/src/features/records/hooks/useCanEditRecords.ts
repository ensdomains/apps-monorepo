import { useQuery } from '@tanstack/react-query'
import { type Address, isAddressEqual } from 'viem'
import { useConnection } from 'wagmi'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { useNameResolverAddress } from '@/features/records/hooks/useNameResolverAddress'
import { getHasRolesQueryOptions } from '@/features/registry/hooks/useHasRoles'
import { getIsPermissionedResolverQueryOptions } from '@/features/resolver/hooks/useIsPermissionedResolver'

type UseCanEditRecordsParams = {
  name: string
  enabled?: boolean
}

type UseCanEditRecordsReturn = {
  canEdit: boolean
  isLoading: boolean
  /** True when the connected wallet is the name token owner. */
  isOwner: boolean
  resolverAddress: Address | null | undefined
}

/**
 * Whether the connected wallet can edit records for `name`.
 *
 * - Permissioned resolvers: authorized by **resolver** root ownership
 *   (`hasRootRoles`), not name-token ownership. After a transfer that keeps
 *   the resolver, the previous owner typically still controls it.
 * - Non-permissioned / V1-style resolvers: falls back to name-token ownership.
 */
export function useCanEditRecords({
  name,
  enabled = true,
}: UseCanEditRecordsParams): UseCanEditRecordsReturn {
  const { address: connectedAddress } = useConnection()

  const ownerQuery = useQuery({
    ...getEnsOwnerQueryOptions({ name }),
    enabled: enabled && !!name,
  })

  const resolverQuery = useNameResolverAddress({
    name: enabled ? name : undefined,
  })
  const resolverAddress = resolverQuery.data

  const isPermissionedQuery = useQuery({
    ...getIsPermissionedResolverQueryOptions({
      resolverAddress: (resolverAddress ??
        '0x0000000000000000000000000000000000000000') as Address,
    }),
    enabled: enabled && !!resolverAddress,
  })

  const isPermissioned = isPermissionedQuery.data === true

  // Same root-role probe the resolver roles page uses for “controls this resolver”.
  const hasResolverRootRoleQuery = useQuery({
    ...getHasRolesQueryOptions({
      resolverAddress: (resolverAddress ??
        '0x0000000000000000000000000000000000000000') as Address,
      roles: ['ROLE_SET_ADDR'],
      account: (connectedAddress ??
        '0x0000000000000000000000000000000000000000') as Address,
    }),
    enabled:
      enabled && !!connectedAddress && !!resolverAddress && isPermissioned,
  })

  const isOwner =
    !!connectedAddress &&
    !!ownerQuery.data?.owner &&
    isAddressEqual(connectedAddress, ownerQuery.data.owner)

  const isLoading =
    (enabled &&
      (ownerQuery.isLoading ||
        resolverQuery.isLoading ||
        (!!resolverAddress && isPermissionedQuery.isLoading) ||
        (isPermissioned && hasResolverRootRoleQuery.isLoading))) ||
    false

  const canEdit = (() => {
    if (!enabled || !connectedAddress || isLoading || !resolverAddress) {
      return false
    }

    if (isPermissioned) return hasResolverRootRoleQuery.data === true

    // Public / non-permissioned resolvers: name-token owner can edit.
    return isOwner
  })()

  return {
    canEdit,
    isLoading,
    isOwner,
    resolverAddress,
  }
}
