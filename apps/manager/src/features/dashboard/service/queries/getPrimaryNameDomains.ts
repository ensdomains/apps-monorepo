import { readNamesForAddress } from '@ens-apps/indexer/bigname'
import type { NameSummary, ReadNamesForAddress } from '@ens-apps/indexer/reads'
import { readAllNames } from '@ens-apps/indexer/reads'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import { okAsync, ResultAsync } from 'neverthrow'
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

const NAME_QUERY = {
  protocol: 'v2',
  sort: 'name',
  order: 'asc',
} as const

const byName = (a: NameSummary, b: NameSummary) =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0

/**
 * Every owned ENSv2 name, plus every name whose ETH record still resolves to
 * the owner wallet (e.g. transferred with the record kept), all pages, so
 * local search never silently omits later names. A label bigname cannot
 * normalize comes back as a bracketed labelhash, which can't be set as a
 * primary name.
 */
export const getPrimaryNameDomains = (
  readNames: ReadNamesForAddress,
  address: Address,
  ownerAddress?: Address,
  signal?: AbortSignal,
) =>
  ResultAsync.combine([
    readAllNames(
      readNames,
      { ...NAME_QUERY, address, relations: ['owner'] },
      { signal },
    ),
    ownerAddress
      ? readAllNames(
          readNames,
          { ...NAME_QUERY, address: ownerAddress, resolvesTo: true },
          { signal },
        )
      : okAsync([]),
  ]).map(([owned, resolving]) =>
    [
      ...new Map(
        [...owned, ...resolving].map((name) => [name.namehash, name]),
      ).values(),
    ]
      .sort(byName)
      .filter(
        ({ name }) => isNormalizedName(name) && !hasEncodedLabelhash(name),
      )
      .map(toPrimaryNameDomain),
  )

export const primaryNameDomainsQuery = (
  address: Address | undefined,
  ownerAddress: Address | undefined,
) =>
  resultQueryOptions({
    queryKey: qk('dashboard', 'primary_name_domains', {
      address: address?.toLowerCase(),
      ownerAddress: ownerAddress?.toLowerCase(),
    }),
    queryFn: address
      ? ({ signal }) =>
          getPrimaryNameDomains(
            readNamesForAddress(bigname),
            address,
            ownerAddress,
            signal,
          )
      : skipToken,
  })
