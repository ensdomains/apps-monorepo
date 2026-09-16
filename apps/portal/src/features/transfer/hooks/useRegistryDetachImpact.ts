import { useQuery } from '@tanstack/react-query'
import { match, P } from 'ts-pattern'
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
 * Both reads opt out of the app-wide one-hour `staleTime`: they gate a
 * destructive, irreversible step, and an hour-old "this registry is empty" is
 * exactly the answer that would wave a detach through after someone registered
 * a subname.
 */
export const useRegistryDetachImpact = ({
  name,
  owner,
}: {
  readonly name: string
  /** The account doing the transfer — everyone else in the registry is a third party. */
  readonly owner: Address
}): RegistryDetachImpact => {
  const registriesQuery = useQuery({
    ...getNameRegistriesQueryOptions({ name }),
    staleTime: 0,
  })

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
    staleTime: 0,
  })

  return (
    match({
      isError: registriesQuery.isError || occupantsQuery.isError,
      hasSubregistry,
      registriesSettled: registriesQuery.isSuccess,
      occupants: occupantsQuery.data,
    })
      .with({ isError: true }, () => ({ status: 'error' }) as const)
      // Nothing is attached, so the step destroys nothing. The only "ready with
      // zero" the form is allowed to see.
      .with(
        { registriesSettled: true, hasSubregistry: false },
        () =>
          ({
            status: 'ready',
            subnameCount: 0,
            hasThirdPartySubnames: false,
          }) as const,
      )
      // null = the indexer has no record of a registry we know is attached. That
      // is "we can't size this", not "it's empty" — fail closed.
      .with({ occupants: null }, () => ({ status: 'error' }) as const)
      .with({ occupants: P.nullish }, () => ({ status: 'pending' }) as const)
      .with({ occupants: P.nonNullable }, ({ occupants }) => ({
        status: 'ready' as const,
        subnameCount: occupants.count,
        hasThirdPartySubnames: occupants.thirdPartyCount > 0,
      }))
      .exhaustive()
  )
}
