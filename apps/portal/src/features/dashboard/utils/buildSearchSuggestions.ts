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

type BuildSuggestionsOptions = {
  value: string
  isMobile: boolean
  navigateToAddress: NavigateToAddress
  navigateToName: NavigateToName
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
}: BuildSuggestionsOptions): Suggestion[] => {
  const trimmedValue = value.trim()
  if (!trimmedValue) return []

  const items: Suggestion[] = []

  // Check if input is a valid Ethereum address
  if (isAddress(trimmedValue, { strict: false })) {
    try {
      const checksum = checksumAddress(trimmedValue as Address)
      items.push({
        id: `address:${checksum}`,
        label: isMobile ? truncateAddress(checksum) : checksum,
        description: 'View address details',
        inputValue: checksum,
        action: () => navigateToAddress(checksum),
      })
      // Return early - don't show ENS name suggestion for valid addresses
      return items
    } catch {
      return []
    }
  }

  // Input is NOT a valid address, treat it as an ENS name
  const lowercaseValue = trimmedValue.toLowerCase()

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
