import { useQuery } from '@tanstack/react-query'
import type { GetEnsOwnerReturnType } from '@/features/profile/hooks/useEnsOwner'
import { useGraceStatus } from '@/features/profile/hooks/useGraceStatus'
import type { TokenRoleHolders } from '@/features/roles/utils/missingPrivileges'
import { getNameRolesAccountsQueryOptions } from './useNameRoleAccounts'
import { getVersionedResourceQueryOptions } from './useVersionedResource'

export type TokenRoleWarningParams = {
  readonly name: string
  readonly ownerData: NonNullable<GetEnsOwnerReturnType>
}

/**
 * A missing-privilege warning derived from the token's role holders by
 * `select`. Shares its cache entry with the Roles tab.
 *
 * Only ENSv2 names have token roles. A name in grace gets no warning: it can't
 * be transferred or reconfigured until it's renewed, whatever its roles say.
 */
export const useTokenRoleWarning = <T>(
  { name, ownerData }: TokenRoleWarningParams,
  select: (holders: TokenRoleHolders) => T,
) => {
  const grace = useGraceStatus({
    name,
    protocolVersion: ownerData.protocolVersion,
  })

  // The role read is keyed by the name's EAC resource, not its label (WEB-1458):
  // `EACRolesChanged` is emitted under the registry's current `eacVersionId`, so
  // an id hashed from the label matches no log. Read here because the owner
  // resolution doesn't carry a resource.
  const resourceQuery = useQuery(
    getVersionedResourceQueryOptions({
      name,
      registryAddress: ownerData.registryAddress,
    }),
  )
  const resource = resourceQuery.data ?? null

  const query = useQuery({
    ...getNameRolesAccountsQueryOptions({
      resource,
      registryAddress: ownerData.registryAddress,
    }),
    select,
    // Without a resource there are no rows to read, so the warning stays off
    // until the resource lands rather than reporting an empty holder set.
    enabled:
      ownerData.protocolVersion === 'ENSv2' &&
      resource !== null &&
      !grace.isLoading &&
      !grace.isInGrace,
  })

  return {
    warning: grace.isInGrace ? undefined : query.data,
    isLoading: grace.isLoading || resourceQuery.isLoading || query.isLoading,
  }
}
