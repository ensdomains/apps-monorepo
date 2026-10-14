import { readNamesForAddress } from '@ens-apps/indexer/bigname'
import type { NameSummary, ReadNamesForAddress } from '@ens-apps/indexer/reads'
import { readAllNames } from '@ens-apps/indexer/reads'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import type { Address } from 'viem'
import {
  hasEncodedLabelhash,
  isNormalizedName,
} from '@/features/register-v2/utils/name-parser'
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
 * later names. A label bigname cannot normalize comes back as a bracketed
 * labelhash, which can't be set as a primary name.
 */
export const getPrimaryNameDomains = (
  readNames: ReadNamesForAddress,
  address: Address,
  signal?: AbortSignal,
) =>
  readAllNames(
    readNames,
    {
      address,
      relations: ['owner'],
      protocol: 'v2',
      sort: 'name',
      order: 'asc',
    },
    { signal },
  ).map((names) =>
    names
      .filter(
        ({ name }) => isNormalizedName(name) && !hasEncodedLabelhash(name),
      )
      .map(toPrimaryNameDomain),
  )

export const primaryNameDomainsQuery = (address: Address | undefined) =>
  resultQueryOptions({
    queryKey: qk('dashboard', 'primary_name_domains', {
      address: address?.toLowerCase(),
    }),
    queryFn: address
      ? ({ signal }) =>
          getPrimaryNameDomains(readNamesForAddress(bigname), address, signal)
      : skipToken,
  })
