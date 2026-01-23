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
  if (!value) return []

  const items: Suggestion[] = []

  // Check if input is a valid Ethereum address
  if (isAddress(value, { strict: false })) {
    try {
      const checksum = checksumAddress(value as Address)
      items.push({
        id: `address:${checksum}`,
        label: isMobile ? truncateAddress(checksum) : checksum,
        description: 'View address details',
        inputValue: checksum,
        action: () => navigateToAddress(checksum),
      })
    } catch {
      return []
    }
  }

  // Add .eth suffix if not present (could be a name or address)
  const valueWithEthSuffix = ensureEthSuffix(value)

  // Check if it's an address-as-name (0x + 40 hex chars)
  const valueWithoutEth = valueWithEthSuffix.replace('.eth', '')
  const isAddressAsName = /^0x[a-fA-F0-9]{40}$/.test(valueWithoutEth)

  // Truncate on mobile if it's an address-as-name
  const displayLabel =
    isMobile && isAddressAsName
      ? `${truncateAddress(valueWithoutEth)}.eth`
      : valueWithEthSuffix

  items.push({
    id: `name:${valueWithEthSuffix}`,
    label: displayLabel,
    description: 'View ENS name details',
    inputValue: valueWithEthSuffix,
    action: () => navigateToName(valueWithEthSuffix),
  })

  return items
}
