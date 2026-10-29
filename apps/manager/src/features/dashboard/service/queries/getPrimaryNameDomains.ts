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
  /** Null when no deployment currently answers for the name. */
  readonly protocol: NameSummary['protocol']
}

const toPrimaryNameDomain = (name: NameSummary): PrimaryNameDomain => ({
  id: name.namehash,
  name: name.name,
  protocol: name.protocol,
})

const nameQuery = {
  sort: 'name',
  order: 'asc',
} as const

const byName = (a: PrimaryNameDomain, b: PrimaryNameDomain) =>
  Number(a.name > b.name) - Number(a.name < b.name)

const toPrimaryNameDomains = (names: readonly NameSummary[]) =>
  names
    .filter(({ name }) => isNormalizedName(name) && !hasEncodedLabelhash(name))
    .map(toPrimaryNameDomain)

/**
 * Every owned name, ENSv1 and ENSv2 alike, all pages, so local search never
 * silently omits later names. A label bigname cannot normalize comes back as a
 * bracketed labelhash, which can't be set as a primary name.
 */
export const getOwnedPrimaryNames = (
  readNames: ReadNamesForAddress,
  address: Address,
  signal?: AbortSignal,
) =>
  readAllNames(
    readNames,
    { ...nameQuery, address, relations: ['owner'] },
    { signal },
  ).map(toPrimaryNameDomains)

/** Names whose ETH record still resolves to the owner wallet (e.g. transferred with the record kept). */
export const getResolvingPrimaryNames = (
  readNames: ReadNamesForAddress,
  ownerAddress: Address,
  signal?: AbortSignal,
) =>
  readAllNames(
    readNames,
    { ...nameQuery, address: ownerAddress, resolvesTo: true },
    { signal },
  ).map(toPrimaryNameDomains)

export const mergePrimaryNameDomains = (
  owned: readonly PrimaryNameDomain[],
  resolving: readonly PrimaryNameDomain[],
) =>
  [
    ...new Map(
      [...owned, ...resolving].map((domain) => [domain.id, domain]),
    ).values(),
  ].sort(byName)

export const ownedPrimaryNamesQuery = (address: Address | undefined) =>
  resultQueryOptions({
    queryKey: qk('dashboard', 'primary_name_owned', {
      address: address?.toLowerCase(),
    }),
    queryFn: address
      ? ({ signal }) =>
          getOwnedPrimaryNames(readNamesForAddress(bigname), address, signal)
      : skipToken,
  })

export const resolvingPrimaryNamesQuery = (ownerAddress: Address | undefined) =>
  resultQueryOptions({
    queryKey: qk('dashboard', 'primary_name_resolving', {
      ownerAddress: ownerAddress?.toLowerCase(),
    }),
    queryFn: ownerAddress
      ? ({ signal }) =>
          getResolvingPrimaryNames(
            readNamesForAddress(bigname),
            ownerAddress,
            signal,
          )
      : skipToken,
    // Optional: the dialog lists owned names without it and says names may be missing.
    retry: false,
  })
