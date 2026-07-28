import { useQuery } from '@tanstack/react-query'
import { zeroAddress } from 'viem'
import { useNameResolverAddress } from '@/features/records/hooks/useNameResolverAddress'
import { getNameRegistriesQueryOptions } from '@/features/registry/hooks/useNameRegistryDiscovery'

export type TransferResetTargets = {
  /** Whether each reset toggle has a target set that's worth showing/resetting. */
  readonly optionIsVisible: {
    readonly resetResolver: boolean
    readonly resetRegistry: boolean
  }
  /** Both lookups succeeded — the reset targets are known. */
  readonly settled: boolean
  /** At least one lookup errored — the reset targets are unknown. */
  readonly failed: boolean
}

/**
 * Discover what a name currently points at, so the transfer form knows which
 * reset options to offer.
 *
 * A failed lookup has `isLoading === false` but `data === undefined`, which
 * looks identical to "nothing to reset". Keying off `isSuccess` (not
 * `!isLoading`) keeps those apart: callers can block on {@link failed} rather
 * than let an irreversible transfer proceed with the resets silently disabled.
 */
export const useTransferResetTargets = ({
  name,
}: {
  name: string
}): TransferResetTargets => {
  const resolverQuery = useNameResolverAddress({ name })
  const registriesQuery = useQuery(getNameRegistriesQueryOptions({ name }))

  const subregistryAddress = registriesQuery.data?.[0]
  const hasResolver = !!resolverQuery.data
  const hasSubregistry =
    !!subregistryAddress && subregistryAddress !== zeroAddress

  return {
    optionIsVisible: {
      resetResolver: resolverQuery.isSuccess && hasResolver,
      resetRegistry: registriesQuery.isSuccess && hasSubregistry,
    },
    settled: resolverQuery.isSuccess && registriesQuery.isSuccess,
    failed: resolverQuery.isError || registriesQuery.isError,
  }
}
