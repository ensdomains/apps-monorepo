import { readNamesForAddress } from '@ens-apps/indexer/bigname'
import type { NameSummary, ReadNamesForAddress } from '@ens-apps/indexer/reads'
import { readAllNames } from '@ens-apps/indexer/reads'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import type { Address } from 'viem'
import { bigname } from '@/lib/bigname'

/** An owned name the primary-name dialog can offer. */
export type PrimaryNameDomain = {
  readonly id: string
  readonly name: string
}

const toPrimaryNameDomain = (name: NameSummary): PrimaryNameDomain => ({
  id: name.namehash,
  name: name.name,
})

/**
 * Every owned ENSv2 name, all pages, so local search never silently omits
 * later names.
 */
export const getPrimaryNameDomains = (
  readNames: ReadNamesForAddress,
  address: Address,
) =>
  readAllNames(readNames, {
    address,
    relations: ['owner'],
    protocol: 'v2',
    sort: 'name',
    order: 'asc',
  }).map((names) => names.map(toPrimaryNameDomain))

export const primaryNameDomainsQuery = (address: Address | undefined) =>
  resultQueryOptions({
    queryKey: qk('dashboard', 'primary_name_domains', {
      address: address?.toLowerCase(),
    }),
    queryFn: address
      ? () => getPrimaryNameDomains(readNamesForAddress(bigname), address)
      : skipToken,
  })
