import { hasResolvedRecords } from '@ens-apps/utils/hasResolvedRecords'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { type Address, isAddress, zeroAddress } from 'viem'
import { useConnection } from 'wagmi'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getNameAvailabilityQueryOptions } from '@/features/profile/hooks/useNameAvailability'
import { getProfileQueryOptions } from '@/features/profile/hooks/useProfile'
import { useIsMobile } from '@/hooks/use-mobile'
import { getSupportsInterfacesQueryOptions } from '@/hooks/useSupportsInterfaces'
import { RESOLVER_INTERFACE_IDS } from '@/lib/constants/resolverInterfaceIds'
import { ensureEthSuffix } from '@/utils/ens/ensureEthSuffix'
import { isRegistrable } from '@/utils/ens/tldHelpers'
import type { AddressNameItem } from '@/utils/names/addressNames'
import type { ProtocolVersion } from '@/utils/types'
import type { Suggestion } from '../utils/buildSearchSuggestions'
import {
  buildSearchSuggestions,
  getSearchNotice,
} from '../utils/buildSearchSuggestions'
import { filterAndSortOwnedNames } from '../utils/ownedNamesUtils'
import {
  buildSearchResultItems,
  getSearchNameVerificationFromQueries,
  getSearchOwnerData,
  isSubname,
  type SearchNameVerification,
  type SearchResultItem,
  sortExactMatchFirst,
} from '../utils/searchResultsUtils'
import { getAddressNamesQueryOptions } from './useAddressNames'
import { useSuggestionTlds } from './useSuggestionTlds'

const MAX_OWNED_NAMES = 5

// Names the wallet owns, or owned until a grace it can still renew in.
const isOwnedName = ({ relations }: AddressNameItem) =>
  relations.includes('owner') || relations.includes('former_owner')

export type UseSearchResultsParams = {
  /** Trimmed search value */
  searchValue: string
  navigateToName: (name: string) => void
  navigateToAddress: (address: string) => void
  navigateToResolver: (address: string) => void
  readonly enabled?: boolean
  readonly fetchOwnedNames?: boolean
}

export type { SearchResultItem } from '../utils/searchResultsUtils'

export type UseSearchResultsReturn = {
  suggestions: readonly Suggestion[]
  ownerBySuggestionId: Map<
    string,
    | {
        owner: string
        registryAddress: string
        protocolVersion: ProtocolVersion
      }
    | null
    | undefined
  >
  /** IDs of ownerless subnames whose records resolve: offchain names. */
  readonly offchainNameIds: ReadonlySet<string>
  readonly failedOwnerIds: ReadonlySet<string>
  readonly failedAvailabilityIds: ReadonlySet<string>
  readonly failedRecordsIds: ReadonlySet<string>
  readonly nameVerificationBySuggestionId: ReadonlyMap<
    string,
    SearchNameVerification
  >
  availableNames: Suggestion[]
  /** IDs of suggestions whose availability check is still in progress. */
  pendingAvailabilityIds: Set<string>
  ownedNamesFiltered: { name: string }[]
  readonly ownedNameSuggestions: readonly { readonly name: string }[]
  readonly isOwnedNamesLoading: boolean
  readonly hasOwnedNamesError: boolean
  /** Flat list in render order for keyboard nav (suggestions, then available, then owned). */
  allItems: SearchResultItem[]
  isTldsLoading: boolean
  hasAnySection: boolean
  /** Set when the input cannot be registered, e.g. a label under 3 characters. */
  readonly searchNotice: string | null
}

/**
 * Shared search results for both inline popover and Cmd+K modal.
 * Returns suggestions (with multi-TLD), owner lookup for avatars,
 * available-to-register names, and names the connected user owns.
 */
export const useSearchResults = ({
  searchValue,
  navigateToName,
  navigateToAddress,
  navigateToResolver,
  enabled = true,
  fetchOwnedNames = true,
}: UseSearchResultsParams): UseSearchResultsReturn => {
  const isMobile = useIsMobile()
  const { address: connectedAddress } = useConnection()
  const { validTlds, isLoading: isTldsLoading } = useSuggestionTlds(
    enabled && Boolean(searchValue),
  )

  const searchedAddress = isAddress(searchValue, { strict: false })
    ? searchValue
    : undefined

  const { data: resolverInterfaces } = useQuery({
    ...getSupportsInterfacesQueryOptions({
      address: (searchedAddress ??
        '0x0000000000000000000000000000000000000000') as Address,
      interfaces: Object.values(RESOLVER_INTERFACE_IDS),
    }),
    enabled: enabled && Boolean(searchedAddress),
  })

  const isResolver = resolverInterfaces?.some(Boolean) ?? false

  const suggestions = useMemo(
    () =>
      buildSearchSuggestions({
        value: searchValue,
        isMobile,
        navigateToAddress,
        navigateToName,
        navigateToResolver,
        isResolver,
        validTlds,
      }),
    [
      searchValue,
      isMobile,
      navigateToAddress,
      navigateToName,
      navigateToResolver,
      isResolver,
      validTlds,
    ],
  )

  const addressForOwned = connectedAddress ?? zeroAddress

  // Disabled observers still expose cached names without fetching a cold portfolio.
  const namesQuery = useQuery({
    ...getAddressNamesQueryOptions({ address: addressForOwned }),
    enabled: fetchOwnedNames && Boolean(connectedAddress),
  })

  const ownedNamesMerged = useMemo(
    () => (namesQuery.data ?? []).filter(isOwnedName),
    [namesQuery.data],
  )

  /** The name the input refers to exactly, e.g. "fox" and "fox.eth" both mean fox.eth. */
  const exactMatchName = useMemo(() => {
    const trimmed = searchValue.trim()
    return searchedAddress || !trimmed ? '' : ensureEthSuffix(trimmed)
  }, [searchValue, searchedAddress])

  /**
   * An owned name that the user typed exactly stays in "Suggestions" instead of
   * moving to "Names you own", so it is the first item and Enter selects it.
   */
  const hasExactMatchSuggestion = useMemo(
    () =>
      suggestions.some(
        (s) => s.inputValue.trim().toLowerCase() === exactMatchName,
      ),
    [suggestions, exactMatchName],
  )

  const ownedNamesFiltered = useMemo(
    () =>
      filterAndSortOwnedNames(ownedNamesMerged, searchValue, {
        max: MAX_OWNED_NAMES,
        exclude: hasExactMatchSuggestion ? exactMatchName : undefined,
      }),
    [searchValue, ownedNamesMerged, hasExactMatchSuggestion, exactMatchName],
  )

  /** Exclude suggestions for names the user already has in "Names you own" to avoid showing the same name twice. */
  const suggestionsFiltered = useMemo(() => {
    const ownedSet = new Set(
      ownedNamesFiltered.map((d) => d.name.trim().toLowerCase()),
    )
    return sortExactMatchFirst(
      suggestions.filter(
        (s) => !ownedSet.has(s.inputValue.trim().toLowerCase()),
      ),
      exactMatchName,
    )
  }, [suggestions, ownedNamesFiltered, exactMatchName])

  const nameSuggestions = useMemo(
    () => suggestionsFiltered.filter((s) => s.id.startsWith('name:')),
    [suggestionsFiltered],
  )

  const ownerQueries = useQueries({
    queries: nameSuggestions.map((s) => ({
      ...getEnsOwnerQueryOptions({ name: s.inputValue }),
      enabled,
    })),
  })

  // An offchain (CCIP-Read) subname has no registry owner but still resolves.
  const ownerlessSubnames = useMemo(
    () =>
      nameSuggestions.filter(
        (s, i) =>
          ownerQueries[i]?.data === null &&
          !ownerQueries[i]?.isError &&
          isSubname(s.inputValue),
      ),
    [nameSuggestions, ownerQueries],
  )

  const recordsQueries = useQueries({
    queries: ownerlessSubnames.map((s) => ({
      ...getProfileQueryOptions({ name: s.inputValue }),
      enabled,
    })),
  })

  const offchainNameIds = useMemo(
    () =>
      new Set(
        ownerlessSubnames
          .filter(
            (_, i) =>
              !recordsQueries[i]?.isError &&
              hasResolvedRecords(recordsQueries[i]?.data?.records),
          )
          .map((s) => s.id),
      ),
    [ownerlessSubnames, recordsQueries],
  )

  const pendingRecordsIds = useMemo(
    () =>
      new Set(
        ownerlessSubnames
          .filter(
            (_, i) =>
              recordsQueries[i]?.isPending || recordsQueries[i]?.isError,
          )
          .map((s) => s.id),
      ),
    [ownerlessSubnames, recordsQueries],
  )

  const ownerBySuggestionId = useMemo(() => {
    return new Map(
      nameSuggestions.map((s, i) => {
        const query = ownerQueries[i]
        const owner = getSearchOwnerData(query, pendingRecordsIds.has(s.id))
        return [s.id, owner] as const
      }),
    )
  }, [nameSuggestions, ownerQueries, pendingRecordsIds])

  // Owner isn't a proxy for registered: an expired name keeps a registry entry
  // pointing at the NameWrapper, so it has an owner and is still available.
  const namesToCheckAvailability = useMemo(
    () => nameSuggestions.filter((s) => isRegistrable(s.inputValue)),
    [nameSuggestions],
  )

  const availabilityQueries = useQueries({
    queries: namesToCheckAvailability.map((s) => ({
      ...getNameAvailabilityQueryOptions({ name: s.inputValue }),
      enabled,
    })),
  })

  const availableNames = useMemo(
    () =>
      namesToCheckAvailability.filter(
        (_, i) =>
          !availabilityQueries[i]?.isError &&
          availabilityQueries[i]?.data?.isAvailable === true,
      ),
    [namesToCheckAvailability, availabilityQueries],
  )

  const pendingAvailabilityIds = useMemo(() => {
    return new Set(
      namesToCheckAvailability
        .filter((_, i) => enabled && availabilityQueries[i]?.isPending)
        .map(({ id }) => id),
    )
  }, [namesToCheckAvailability, availabilityQueries, enabled])

  const failedOwnerIds = new Set(
    nameSuggestions
      .filter((_, i) => ownerQueries[i]?.isError)
      .map(({ id }) => id),
  )
  const failedAvailabilityIds = new Set(
    namesToCheckAvailability
      .filter((_, i) => availabilityQueries[i]?.isError)
      .map(({ id }) => id),
  )
  const failedRecordsIds = new Set(
    ownerlessSubnames
      .filter((_, i) => recordsQueries[i]?.isError)
      .map(({ id }) => id),
  )
  const nameVerificationBySuggestionId = new Map(
    nameSuggestions.map((suggestion, index) => {
      const ownerQuery = ownerQueries[index]
      const recordIndex = ownerlessSubnames.findIndex(
        ({ id }) => id === suggestion.id,
      )
      const recordQuery = recordsQueries[recordIndex]
      const availabilityIndex = namesToCheckAvailability.findIndex(
        ({ id }) => id === suggestion.id,
      )
      const availabilityQuery = availabilityQueries[availabilityIndex]
      const verification = getSearchNameVerificationFromQueries({
        name: suggestion.inputValue,
        isEnabled: enabled,
        owner: ownerQuery,
        records: recordQuery,
        hasResolution: offchainNameIds.has(suggestion.id),
        availability: availabilityQuery,
      })
      return [suggestion.id, verification] as const
    }),
  )

  const hasSuggestions = suggestionsFiltered.length > 0
  const hasOwned = ownedNamesFiltered.length > 0
  const hasAnySection = hasSuggestions || hasOwned
  const searchNotice = hasAnySection ? null : getSearchNotice(searchValue)

  const allItems = useMemo(
    () =>
      buildSearchResultItems({
        suggestions: suggestionsFiltered,
        availableNames,
        ownedNamesFiltered,
      }),
    [suggestionsFiltered, availableNames, ownedNamesFiltered],
  )

  return {
    suggestions: suggestionsFiltered,
    ownerBySuggestionId,
    offchainNameIds,
    failedOwnerIds,
    failedAvailabilityIds,
    failedRecordsIds,
    nameVerificationBySuggestionId,
    availableNames,
    pendingAvailabilityIds,
    ownedNamesFiltered,
    ownedNameSuggestions: ownedNamesMerged
      .slice(0, MAX_OWNED_NAMES)
      .map(({ name }) => ({ name })),
    isOwnedNamesLoading: namesQuery.isLoading,
    hasOwnedNamesError: namesQuery.isError,
    allItems,
    isTldsLoading,
    hasAnySection,
    searchNotice,
  }
}
