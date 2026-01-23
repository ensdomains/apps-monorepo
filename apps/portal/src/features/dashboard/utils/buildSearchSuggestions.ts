import { type Address, checksumAddress, isAddress } from 'viem'
import { ensureEthSuffix } from '@/utils/ens/ensureEthSuffix'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

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
  // Add .eth suffix if not present
  const valueWithEthSuffix = ensureEthSuffix(trimmedValue)

  items.push({
    id: `name:${valueWithEthSuffix}`,
    label: valueWithEthSuffix,
    description: 'View ENS name details',
    inputValue: valueWithEthSuffix,
    action: () => navigateToName(valueWithEthSuffix),
  })

  return items
}
