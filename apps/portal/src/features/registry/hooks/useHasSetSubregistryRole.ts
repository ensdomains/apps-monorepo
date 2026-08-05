import { useQuery } from '@tanstack/react-query'
import { zeroAddress } from 'viem'
import { useConnection } from 'wagmi'
import { getHasRolesQueryOptions } from './useHasRoles'
import { getNameRegistriesQueryOptions } from './useNameRegistryDiscovery'

export const useHasSetSubregistryRole = (
  name: string,
  { enabled = true }: { enabled?: boolean } = {},
) => {
  const { address: connectedAddress } = useConnection()

  const {
    data: registries,
    isLoading: isRegistriesLoading,
    error: registriesError,
  } = useQuery({
    ...getNameRegistriesQueryOptions({ name }),
    enabled,
  })

  const label = name.split('.')[0]
  const parentRegistry = registries?.at(1) ?? null

  const {
    data: hasRole,
    isLoading: isRoleLoading,
    error: roleError,
  } = useQuery({
    ...getHasRolesQueryOptions({
      registryAddress: parentRegistry ?? zeroAddress,
      label,
      roles: ['ROLE_SET_SUBREGISTRY'],
      account: connectedAddress ?? zeroAddress,
    }),
    enabled:
      enabled && !!connectedAddress && !!parentRegistry && !isRegistriesLoading,
  })

  const error = registriesError ?? roleError

  return {
    hasRole: error ? undefined : (hasRole ?? false),
    isLoading: enabled && (isRegistriesLoading || isRoleLoading),
    error,
    parentRegistry,
    connectedAddress,
  }
}
