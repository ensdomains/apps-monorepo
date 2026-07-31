import { useQuery } from '@tanstack/react-query'
import { zeroAddress } from 'viem'
import { useNameResolverAddress } from '@/features/records/hooks/useNameResolverAddress'
import { getNameRegistriesQueryOptions } from '@/features/registry/hooks/useNameRegistryDiscovery'
import { getEthAddressQueryOptions } from '../queries/getEthAddress'

type TransferDetachTargets = {
  /** Whether each option has a target worth showing/detaching. */
  readonly optionIsVisible: {
    readonly setEthAddress: boolean
    readonly detachResolver: boolean
    readonly detachRegistry: boolean
  }
  /** Every lookup succeeded — the targets are known. */
  readonly settled: boolean
  /** At least one lookup errored — the targets are unknown. */
  readonly failed: boolean
}

/**
 * Discover what a name currently points at, so the transfer form knows which
 * options to offer: the ETH-address repoint only when an ETH address is set,
 * the resolver/registry detaches only when there's something to detach.
 *
 * Keys off `isSuccess` (not `!isLoading`) so a failed lookup — which also has
 * `data === undefined` — doesn't look like "nothing to detach"; callers block on
 * {@link failed} instead of transferring with the options silently disabled.
 */
export const useTransferDetachTargets = ({
  name,
}: {
  name: string
}): TransferDetachTargets => {
  const resolverQuery = useNameResolverAddress({ name })
  const registriesQuery = useQuery(getNameRegistriesQueryOptions({ name }))
  const ethAddressQuery = useQuery(getEthAddressQueryOptions(name))

  const subregistryAddress = registriesQuery.data?.[0]
  const hasResolver = !!resolverQuery.data
  const hasSubregistry =
    !!subregistryAddress && subregistryAddress !== zeroAddress
  const hasEthAddress = !!ethAddressQuery.data

  return {
    optionIsVisible: {
      setEthAddress: ethAddressQuery.isSuccess && hasEthAddress,
      detachResolver: resolverQuery.isSuccess && hasResolver,
      detachRegistry: registriesQuery.isSuccess && hasSubregistry,
    },
    settled:
      resolverQuery.isSuccess &&
      registriesQuery.isSuccess &&
      ethAddressQuery.isSuccess,
    failed: resolverQuery.isError || registriesQuery.isError,
  }
}
