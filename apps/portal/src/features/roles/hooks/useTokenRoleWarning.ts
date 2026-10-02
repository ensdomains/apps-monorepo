import { useQuery } from '@tanstack/react-query'
import type { GetEnsOwnerReturnType } from '@/features/profile/hooks/useEnsOwner'
import { useGraceStatus } from '@/features/profile/hooks/useGraceStatus'
import type { TokenRoleHolders } from '@/features/roles/utils/missingPrivileges'
import { getNameRolesAccountsQueryOptions } from './useNameRoleAccounts'

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

  const query = useQuery({
    ...getNameRolesAccountsQueryOptions({
      name,
      registryAddress: ownerData.registryAddress,
    }),
    select,
    enabled:
      ownerData.protocolVersion === 'ENSv2' &&
      !grace.isLoading &&
      !grace.isInGrace,
  })

  return {
    warning: grace.isInGrace ? undefined : query.data,
    isLoading: grace.isLoading || query.isLoading,
  }
}
