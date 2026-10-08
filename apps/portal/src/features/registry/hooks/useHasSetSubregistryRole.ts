import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { zeroAddress } from 'viem'
import { useConnection } from 'wagmi'
import { resourceIdForName } from '@/lib/resource/resourceId'
import { getHasRolesQueryOptions } from './useHasRoles'
import { getNameRegistriesQueryOptions } from './useNameRegistryDiscovery'
import { getNameResourceIdQueryOptions } from './useNameResourceId'

export type UseHasSetSubregistryRoleResult = {
  hasRole: boolean | undefined
  isLoading: boolean
  error: Error | null
  parentRegistry: Address | null
  connectedAddress: Address | undefined
}

export const useHasSetSubregistryRole = (
  name: string,
  { enabled = true }: { enabled?: boolean } = {},
): UseHasSetSubregistryRoleResult => {
  const { address: connectedAddress } = useConnection()

  const {
    data: registries,
    isLoading: isRegistriesLoading,
    error: registriesError,
  } = useQuery({
    ...getNameRegistriesQueryOptions({ name }),
    enabled,
  })

  const parentRegistry = registries?.at(1) ?? null

  // The name's id rather than its label: a label rendered `[<64 hex>]` does
  // not say which name it is, so the gate asks about the id (WEB-1458). An
  // ordinary first label is hashed here; only the ambiguous form costs a read.
  const idFromName = resourceIdForName(name).unwrapOr(null)
  const {
    data: readId,
    isLoading: isReadingId,
    error: readIdError,
  } = useQuery({
    ...getNameResourceIdQueryOptions({
      name,
      registryAddress: parentRegistry ?? undefined,
    }),
    enabled: enabled && idFromName === null && Boolean(parentRegistry),
  })
  const resourceId = idFromName ?? readId ?? null

  const {
    data: hasRole,
    isLoading: isRoleLoading,
    error: roleError,
  } = useQuery({
    ...getHasRolesQueryOptions({
      registryAddress: parentRegistry ?? zeroAddress,
      resource: resourceId,
      roles: ['ROLE_SET_SUBREGISTRY'],
      account: connectedAddress ?? zeroAddress,
    }),
    enabled:
      enabled &&
      !!connectedAddress &&
      !!parentRegistry &&
      !isRegistriesLoading &&
      !!resourceId,
  })

  // The id read gets its own place in the error channel: a failed read must
  // not reach callers as "no permission".
  const error = registriesError ?? readIdError ?? roleError

  return {
    hasRole: error ? undefined : (hasRole ?? false),
    isLoading: enabled && (isRegistriesLoading || isReadingId || isRoleLoading),
    error,
    parentRegistry,
    connectedAddress,
  }
}
