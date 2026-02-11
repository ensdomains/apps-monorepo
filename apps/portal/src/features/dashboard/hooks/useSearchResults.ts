import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { Address } from 'viem'
import { useConnection } from 'wagmi'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getNameAvailabilityQueryOptions } from '@/features/profile/hooks/useNameAvailability'
import { useIsMobile } from '@/hooks/use-mobile'
import { isRegistrable } from '@/utils/ens/tldHelpers'
import type { Suggestion } from '../utils/buildSearchSuggestions'
import { buildSearchSuggestions } from '../utils/buildSearchSuggestions'
import {
  filterAndSortOwnedNames,
  mergeOwnedNames,
} from '../utils/ownedNamesUtils'
import {
  buildSearchResultItems,
  type SearchResultItem,
} from '../utils/searchResultsUtils'
import { useSuggestionTlds } from './useSuggestionTlds'
import { getV1NamesForAddressQueryOptions } from './useV1NamesForAddress'
import { getV2NamesForAddressQueryOptions } from './useV2NamesForAddress'

const MAX_OWNED_NAMES = 5

export type UseSearchResultsParams = {
  /** Trimmed search value */
  searchValue: string
  navigateToName: (name: string) => void
  navigateToAddress: (address: string) => void
}

export type { SearchResultItem } from '../utils/searchResultsUtils'

export type UseSearchResultsReturn = {
  suggestions: Suggestion[]
  ownerBySuggestionId: Map<
    string,
    | { owner: string; registryAddress: string; network: string }
    | null
    | undefined
  >
  availableNames: Suggestion[]
  ownedNamesFiltered: { name: string }[]
  /** Flat list in render order for keyboard nav (suggestions, then available, then owned). */
  allItems: SearchResultItem[]
  isTldsLoading: boolean
  hasAnySection: boolean
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
}: UseSearchResultsParams): UseSearchResultsReturn => {
  const isMobile = useIsMobile()
  const { address: connectedAddress } = useConnection()
  const { validTlds, isLoading: isTldsLoading } = useSuggestionTlds()

  const suggestions = useMemo(
    () =>
      buildSearchSuggestions({
        value: searchValue,
        isMobile,
        navigateToAddress,
        navigateToName,
        validTlds,
      }),
    [searchValue, isMobile, navigateToAddress, navigateToName, validTlds],
  )

  const nameSuggestions = useMemo(
    () => suggestions.filter((s) => s.id.startsWith('name:')),
    [suggestions],
  )

  const ownerQueries = useQueries({
    queries: nameSuggestions.map((s) =>
      getEnsOwnerQueryOptions({ name: s.inputValue }),
    ),
  })

  const ownerBySuggestionId = useMemo(() => {
    const m = new Map<
      string,
      | { owner: string; registryAddress: string; network: string }
      | null
      | undefined
    >()
    nameSuggestions.forEach((s, i) => {
      m.set(s.id, ownerQueries[i]?.data)
    })
    return m
  }, [nameSuggestions, ownerQueries])

  const namesToCheckAvailability = useMemo(
    () =>
      nameSuggestions.filter(
        (s) =>
          ownerBySuggestionId.get(s.id) === null && isRegistrable(s.inputValue),
      ),
    [nameSuggestions, ownerBySuggestionId],
  )

  const availabilityQueries = useQueries({
    queries: namesToCheckAvailability.map((s) =>
      getNameAvailabilityQueryOptions({ name: s.inputValue }),
    ),
  })

  const availableNames = useMemo(
    () =>
      namesToCheckAvailability.filter(
        (_, i) => availabilityQueries[i]?.data?.isAvailable === true,
      ),
    [namesToCheckAvailability, availabilityQueries],
  )

  const addressForOwned = (connectedAddress ??
    '0x0000000000000000000000000000000000000000') as Address

  const [v1NamesQuery, v2NamesQuery] = useQueries({
    queries: [
      {
        ...getV1NamesForAddressQueryOptions({ address: addressForOwned }),
        enabled: Boolean(connectedAddress),
      },
      {
        ...getV2NamesForAddressQueryOptions({ address: addressForOwned }),
        enabled: Boolean(connectedAddress),
      },
    ],
  })

  const ownedNamesMerged = useMemo(
    () =>
      mergeOwnedNames(
        v1NamesQuery.data ?? [],
        (v2NamesQuery.data ?? []).map((d) => ({ name: d.name })),
      ),
    [v1NamesQuery.data, v2NamesQuery.data],
  )

  const ownedNamesFiltered = useMemo(
    () =>
      filterAndSortOwnedNames(ownedNamesMerged, searchValue, {
        max: MAX_OWNED_NAMES,
      }),
    [searchValue, ownedNamesMerged],
  )

  const hasSuggestions = suggestions.length > 0
  const hasAvailable = availableNames.length > 0
  const hasOwned = ownedNamesFiltered.length > 0
  const hasAnySection = hasSuggestions || hasAvailable || hasOwned

  const allItems = useMemo(
    () =>
      buildSearchResultItems({
        suggestions,
        availableNames,
        ownedNamesFiltered,
      }),
    [suggestions, availableNames, ownedNamesFiltered],
  )

  return {
    suggestions,
    ownerBySuggestionId,
    availableNames,
    ownedNamesFiltered,
    allItems,
    isTldsLoading,
    hasAnySection,
  }
}
