import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import type { Address } from 'viem'
import {
  type ClassifiedName,
  classifyNames,
} from '@/features/migration/service/classifyNames'
import { getV1NamesForAddress } from '@/features/migration/service/v1SubgraphClient'

/**
 * Fetches and classifies the ENS v1 names associated with an arbitrary
 * address (owned, registrant, or wrapped owner). Unlike the migration hooks,
 * this is not bound to the connected account, so it can be used to view the
 * v1 names of any address in the address profile.
 *
 * Returns the `classified` set (valid, named v1 domains), mirroring how the
 * dashboard surfaces v1 names. Ineligible/junk entries (unknown labels,
 * expired registrations, etc.) are excluded.
 */
export const profileV1NamesQuery = (address?: Address) =>
  resultQueryOptions({
    queryKey: qk('profile', 'v1_names', { address: address?.toLowerCase() }),
    queryFn: address
      ? () =>
          getV1NamesForAddress(address).map<readonly ClassifiedName[]>(
            (domains) => classifyNames(domains, address).classified,
          )
      : skipToken,
    staleTime: 5 * 60 * 1000,
  })
