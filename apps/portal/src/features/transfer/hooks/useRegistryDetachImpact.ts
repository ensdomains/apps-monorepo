import { useQuery } from '@tanstack/react-query'
import { type Address, zeroAddress } from 'viem'
import { getNameRegistriesQueryOptions } from '@/features/registry/hooks/useNameRegistryDiscovery'
import { getRegistryOccupantsQueryOptions } from '@/features/registry/hooks/useRegistryOccupants'
import type { RegistryDetachImpact } from '../types'

/**
 * What `setSubregistry(0x0)` would cost. The name's own subregistry is the
 * route every `*.name` subname resolves through, so zeroing it stops all of
 * them resolving at once — including subnames held by people who are not party
 * to the transfer, aren't notified, and hold no role that would let them repair
 * it. The form needs the size of that blast radius before it lets the step run.
 *
 * The occupants read depends on the discovery read, so it's a second query
 * rather than a sibling in one `useQueries`; the discovery query itself is the
 * same cache entry `useTransferDetachTargets` already reads.
 *
 * Loading and error are surfaced rather than folded into zero: "we couldn't
 * count the subnames" must not read as "there are none".
 */
export const useRegistryDetachImpact = ({
  name,
  owner,
}: {
  readonly name: string
  /** The account doing the transfer — everyone else in the registry is a third party. */
  readonly owner: Address
}): RegistryDetachImpact => {
  const registriesQuery = useQuery(getNameRegistriesQueryOptions({ name }))

  // registries are `[name, ...ancestors, root]`, so index 0 is the name's own
  // subregistry — the slot the detach step zeroes.
  const subregistryAddress = registriesQuery.data?.[0]
  const hasSubregistry =
    !!subregistryAddress && subregistryAddress !== zeroAddress

  const occupantsQuery = useQuery({
    ...getRegistryOccupantsQueryOptions({
      address: subregistryAddress ?? zeroAddress,
      account: owner,
    }),
    enabled: hasSubregistry,
  })

  return {
    subnameCount: occupantsQuery.data?.count ?? 0,
    hasThirdPartySubnames: (occupantsQuery.data?.thirdPartyCount ?? 0) > 0,
    isLoading: registriesQuery.isLoading || occupantsQuery.isLoading,
    isError: registriesQuery.isError || occupantsQuery.isError,
  }
}
