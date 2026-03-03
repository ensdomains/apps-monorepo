import { type Address, checksumAddress, isAddress } from 'viem'
import { ensureEthSuffix } from '@/utils/ens/ensureEthSuffix'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { isValidEnsName } from '@/utils/token/isNormalized'

export type Suggestion = {
  id: string
  label: string
  description: string
  inputValue: string
  action: () => void
}

type NavigateToAddress = (address: string) => void
type NavigateToName = (name: string) => void
type NavigateToResolver = (address: string) => void

type BuildSuggestionsOptions = {
  value: string
  isMobile: boolean
  navigateToAddress: NavigateToAddress
  navigateToName: NavigateToName
  navigateToResolver?: NavigateToResolver
  /** When true, the searched address supports resolver interfaces. */
  isResolver?: boolean
  /** When set and value is a single label (no dots), suggest label.tld for each valid TLD. */
  validTlds?: readonly string[]
}

/**
 * Pure function to build search suggestions from user input
 * Handles both Ethereum addresses and ENS names
 *
 * @param options - Configuration object
 * @returns Array of suggestions to display
 */
export const buildSearchSuggestions = ({
  value,
  isMobile,
  navigateToAddress,
  navigateToName,
  navigateToResolver,
  isResolver,
  validTlds,
}: BuildSuggestionsOptions): Suggestion[] => {
  const trimmedValue = value.trim()
  if (!trimmedValue) return []

  const items: Suggestion[] = []

  // Check if input is a valid Ethereum address
  if (isAddress(trimmedValue, { strict: false })) {
    try {
      const checksum = checksumAddress(trimmedValue as Address)

      if (isResolver && navigateToResolver) {
        items.push({
          id: `resolver:${checksum}`,
          label: isMobile ? truncateAddress(checksum) : checksum,
          description: 'View resolver details',
          inputValue: checksum,
          action: () => navigateToResolver(checksum),
        })
      } else {
        items.push({
          id: `address:${checksum}`,
          label: isMobile ? truncateAddress(checksum) : checksum,
          description: 'View address details',
          inputValue: checksum,
          action: () => navigateToAddress(checksum),
        })
      }

      return items
    } catch {
      return []
    }
  }

  // Input is NOT a valid address, treat it as an ENS name
  const lowercaseValue = trimmedValue.toLowerCase()
  const dotIndex = lowercaseValue.indexOf('.')
  const labelBeforeDot =
    dotIndex >= 0 ? lowercaseValue.slice(0, dotIndex) : lowercaseValue
  const partialTld = dotIndex >= 0 ? lowercaseValue.slice(dotIndex + 1) : ''
  const hasLabelForTlds = labelBeforeDot.length > 0

  // Helper to create a name suggestion
  const createNameSuggestion = (name: string): Suggestion => {
    const displayLabel = isMobile ? truncateAddress(name, 18, 8) : name
    return {
      id: `name:${name}`,
      label: displayLabel,
      description: 'View ENS name details',
      inputValue: name,
      action: () => navigateToName(name),
    }
  }

  // Multi-TLD mode: suggest label.tld. If user typed a partial TLD (e.g. "fresh.e" or "fresh.c"),
  // only suggest .eth (always) plus TLDs that start with that prefix (e.g. .eth for "e"; .eth and .com for "c").
  if (validTlds?.length && hasLabelForTlds) {
    const tldsToSuggest =
      partialTld === ''
        ? [...validTlds]
        : [
            'eth',
            ...validTlds.filter((t) => t !== 'eth' && t.startsWith(partialTld)),
          ]
    for (const tld of tldsToSuggest) {
      const name = `${labelBeforeDot}.${tld}`
      if (isValidEnsName(name)) {
        items.push(createNameSuggestion(name))
      }
    }
    return items
  }

  // If input is already a valid ENS name (e.g., "eth", "vitalik.eth"), show it first
  if (isValidEnsName(lowercaseValue)) {
    items.push(createNameSuggestion(lowercaseValue))
  }

  // If input doesn't end with .eth, also suggest the .eth version (if different)
  if (!lowercaseValue.endsWith('.eth')) {
    const valueWithEthSuffix = ensureEthSuffix(lowercaseValue)
    // Only add if it's different from the original (ensureEthSuffix returns same value if input has dots)
    if (
      valueWithEthSuffix !== lowercaseValue &&
      isValidEnsName(valueWithEthSuffix)
    ) {
      items.push(createNameSuggestion(valueWithEthSuffix))
    }
  }

  return items
}
