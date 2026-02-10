import { useQueries, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { Address } from 'viem'
import { useConnection } from 'wagmi'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getNameAvailabilityQueryOptions } from '@/features/profile/hooks/useNameAvailability'
import { useIsMobile } from '@/hooks/use-mobile'
import { isRegistrable } from '@/utils/ens/tldHelpers'
import type { Suggestion } from '../utils/buildSearchSuggestions'
import { buildSearchSuggestions } from '../utils/buildSearchSuggestions'
import { useSuggestionTlds } from './useSuggestionTlds'
import { getV2NamesForAddressQueryOptions } from './useV2NamesForAddress'

const MAX_OWNED_NAMES = 5

export type UseSearchResultsParams = {
  /** Trimmed search value */
  searchValue: string
  navigateToName: (name: string) => void
  navigateToAddress: (address: string) => void
}

export type SearchResultItem =
  | { type: 'suggestion'; value: string; suggestion: Suggestion }
  | { type: 'available'; value: string; name: string }
  | { type: 'owned'; value: string; name: string }

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

  const { data: ownedNamesData } = useQuery({
    ...getV2NamesForAddressQueryOptions({
      address: (connectedAddress ??
        '0x0000000000000000000000000000000000000000') as Address,
    }),
    enabled: Boolean(connectedAddress),
  })

  const ownedNamesFiltered = useMemo(() => {
    if (!searchValue.trim() || !ownedNamesData) return []
    const q = searchValue.trim().toLowerCase()
    return ownedNamesData
      .filter((d) => d.name.toLowerCase().includes(q))
      .slice(0, MAX_OWNED_NAMES)
  }, [searchValue, ownedNamesData])

  const hasSuggestions = suggestions.length > 0
  const hasAvailable = availableNames.length > 0
  const hasOwned = ownedNamesFiltered.length > 0
  const hasAnySection = hasSuggestions || hasAvailable || hasOwned

  const allItems = useMemo<SearchResultItem[]>(() => {
    const items: SearchResultItem[] = []
    for (const s of suggestions) {
      items.push({ type: 'suggestion', value: s.id, suggestion: s })
    }
    for (const s of availableNames) {
      items.push({
        type: 'available',
        value: `available:${s.inputValue}`,
        name: s.inputValue,
      })
    }
    for (const d of ownedNamesFiltered) {
      items.push({ type: 'owned', value: `owned:${d.name}`, name: d.name })
    }
    return items
  }, [suggestions, availableNames, ownedNamesFiltered])

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
