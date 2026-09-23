import { useQueries, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { type Address, isAddressEqual } from 'viem'
import { useConnection } from 'wagmi'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { useNameHasOwnResolver } from '@/features/records/hooks/useNameHasOwnResolver'
import { useNameResolverAddress } from '@/features/records/hooks/useNameResolverAddress'
import { getHasRolesQueryOptions } from '@/features/registry/hooks/useHasRoles'
import { getIsPermissionedResolverQueryOptions } from '@/features/resolver/hooks/useIsPermissionedResolver'
import {
  computeResolverResource,
  type ResolverPermissionKey,
  type ResolverSetterScope,
  ROOT_RESOURCE,
} from '@/lib/roles/resolverRoles'

/** Roles that authorize writing common profile records on a permissioned resolver. */
export const RECORD_EDIT_ROLES = [
  'ROLE_SET_ADDRESS',
  'ROLE_SET_TEXT',
  'ROLE_SET_CONTENTHASH',
  'ROLE_SET_ABI',
] as const satisfies readonly ResolverPermissionKey[]

type UseCanEditRecordsParams = {
  name: string
  /** Roles that count as “can edit”. Defaults to the main record-write roles. */
  roles?: readonly ResolverPermissionKey[]
  /**
   * One setter argument (a coin type, a text key) to check in addition to the
   * root scope, for callers editing a single record.
   */
  scope?: ResolverSetterScope
  enabled?: boolean
}

type UseCanEditRecordsReturn = {
  canEdit: boolean
  isLoading: boolean
  /** True when the connected wallet is the name token owner. */
  isOwner: boolean
  /**
   * False when the resolver answering for the name is inherited from an
   * ancestor (or absent) rather than set on the name itself, so there is
   * nothing to write records to. Undefined until known.
   */
  hasOwnResolver: boolean | undefined
  resolverAddress: Address | null | undefined
}

/**
 * Whether the connected wallet can edit records for `name`.
 *
 * - Permissioned resolvers: authorized by resolver `ROLE_SET_*` on the root
 *   resource (every name) or on the setter argument in `scope`. Roles are per
 *   resolver, not per name, so after a transfer that keeps the resolver the
 *   previous owner typically retains them while the new token owner does not.
 * - Non-permissioned / V1-style resolvers: falls back to token ownership.
 *
 * Either way the name must own its resolver. One inherited through ENSIP-10
 * wildcard resolution — a DNS name resolving through its TLD's
 * OffchainDNSResolver, say — reads fine but takes no writes, and ownership of
 * the name grants nothing on a resolver that belongs to an ancestor. See
 * {@link useNameHasOwnResolver}.
 */
export function useCanEditRecords({
  name,
  roles = RECORD_EDIT_ROLES,
  scope,
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

  // Which registry holds the name decides where its own resolver pointer
  // lives, so the check waits on the owner query for the protocol version
  // rather than assuming the v2 walk can answer for a v1 name.
  const ownResolverQuery = useNameHasOwnResolver({
    name: enabled ? name : undefined,
    protocolVersion: ownerQuery.data?.protocolVersion,
  })
  const hasOwnResolver = ownResolverQuery.data

  const isPermissionedQuery = useQuery({
    ...getIsPermissionedResolverQueryOptions({
      resolverAddress: (resolverAddress ??
        '0x0000000000000000000000000000000000000000') as Address,
    }),
    enabled: enabled && !!resolverAddress,
  })

  // The contract ORs root roles into every resource check, so checking the
  // setter resource covers both "granted everywhere" and "granted for this
  // argument". Without a scope only the root resource is meaningful.
  const resource = useMemo(
    () => (scope ? computeResolverResource(scope) : ROOT_RESOURCE),
    [scope],
  )

  const isPermissioned = isPermissionedQuery.data === true

  const roleQueries = useQueries({
    queries: roles.map((role) => ({
      ...getHasRolesQueryOptions({
        resolverAddress: (resolverAddress ??
          '0x0000000000000000000000000000000000000000') as Address,
        resource,
        roles: [role],
        account: (connectedAddress ??
          '0x0000000000000000000000000000000000000000') as Address,
      }),
      enabled:
        enabled && !!connectedAddress && !!resolverAddress && isPermissioned,
    })),
  })

  const isOwner =
    !!connectedAddress &&
    !!ownerQuery.data?.owner &&
    isAddressEqual(connectedAddress, ownerQuery.data.owner)

  const rolesLoading =
    isPermissioned && roleQueries.some((query) => query.isLoading)

  const isLoading =
    (enabled &&
      (ownerQuery.isLoading ||
        resolverQuery.isLoading ||
        ownResolverQuery.isLoading ||
        (!!resolverAddress && isPermissionedQuery.isLoading) ||
        rolesLoading)) ||
    false

  const hasResolverRole = roleQueries.some((query) => query.data === true)

  const canEdit = (() => {
    if (!enabled || !connectedAddress || isLoading || !resolverAddress) {
      return false
    }

    // Anything but a definite "yes" blocks the write: the query throws rather
    // than guessing when it cannot reach the chain, and a write sent on an
    // unverified resolver is the failure this check exists to prevent.
    if (hasOwnResolver !== true) return false

    if (isPermissioned) return hasResolverRole

    // Public / non-permissioned resolvers: token owner can edit.
    return isOwner
  })()

  return {
    canEdit,
    isLoading,
    isOwner,
    hasOwnResolver,
    resolverAddress,
  }
}
