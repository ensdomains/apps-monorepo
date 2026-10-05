import { useQuery } from '@tanstack/react-query'
import { match, P } from 'ts-pattern'
import { type Address, zeroAddress } from 'viem'
import { getRegistryOccupantsQueryOptions } from '@/features/registry/hooks/useRegistryOccupants'
import type { RegistryDetachImpact } from '../types'

/**
 * What `setSubregistry(0x0)` would cost. The name's own subregistry is the
 * route every `*.name` subname resolves through, so zeroing it stops all of
 * them resolving at once — including subnames held by people who are not party
 * to the transfer, aren't notified, and hold no role that would let them repair
 * it. The form needs the size of that blast radius before it lets the step run.
 *
 * Takes the subregistry rather than looking it up: `useTransferDetachTargets`
 * has already resolved it to decide whether to offer the option at all, and a
 * second discovery read here would be the same call with its own freshness
 * policy — the option's visibility and its blast radius must describe the same
 * registry.
 *
 * Opted out of the app-wide one-hour staleTime for the same reason that hook
 * is: an hour-old "this registry is empty" is exactly the answer that would
 * wave a detach through after someone registered a subname. The flip side is
 * that a revisit re-reads in the background while still showing the old
 * answer, so `isRevalidating` and `countedRegistry` let the form tell whether
 * what it is showing still describes what the write would destroy.
 */
export const useRegistryDetachImpact = ({
  name,
  subregistryAddress,
  owner,
}: {
  /** The name being transferred; only its own subnames are counted. */
  readonly name: string
  /** The name's own subregistry, or null when it has none to detach. */
  readonly subregistryAddress: Address | null
  /** The account doing the transfer — everyone else in the registry is a third party. */
  readonly owner: Address
}): RegistryDetachImpact => {
  const { data, isError, isFetching } = useQuery({
    ...getRegistryOccupantsQueryOptions({
      address: subregistryAddress ?? zeroAddress,
      name,
      account: owner,
    }),
    enabled: subregistryAddress !== null,
    staleTime: 0,
  })

  // Nothing attached means the step destroys nothing — the only "ready with
  // zero" the form is allowed to see.
  if (subregistryAddress === null)
    return {
      status: 'ready',
      subnameCount: 0,
      hasThirdPartySubnames: false,
      countedRegistry: null,
      isRevalidating: false,
    }

  return (
    match({ isError, data })
      .with({ isError: true }, () => ({ status: 'error' }) as const)
      // null = the indexer has no record of a registry we know is attached. That
      // is "we can't size this", not "it's empty" — fail closed.
      .with({ data: null }, () => ({ status: 'error' }) as const)
      .with({ data: P.nullish }, () => ({ status: 'pending' }) as const)
      .with({ data: P.nonNullable }, ({ data }) => ({
        status: 'ready' as const,
        subnameCount: data.count,
        hasThirdPartySubnames: data.thirdPartyCount > 0,
        countedRegistry: subregistryAddress,
        // `staleTime: 0` means a revisit refetches while keeping the previous
        // answer visible and the query successful. Surfaced so the form can
        // refuse to act on numbers that are already being replaced.
        isRevalidating: isFetching,
      }))
      .exhaustive()
  )
}
