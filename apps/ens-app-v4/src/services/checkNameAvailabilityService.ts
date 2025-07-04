// Mock unavailable names
const UNAVAILABLE_NAMES = [
  'ucles.eth',
  'test.eth',
  'vitalik.eth',
  'ethereum.eth',
  'ens.eth',
  'wallet.eth',
  'crypto.eth',
  'bitcoin.eth',
  'web3.eth',
  'defi.eth',
  'nft.eth',
  'dao.eth',
  'metaverse.eth',
  'blockchain.eth',
  'smart.eth',
  'contract.eth',
  'dapp.eth',
  'token.eth',
  'coin.eth',
  'money.eth',
]

export interface NameAvailabilityResult {
  name: string
  isAvailable: boolean
  error?: string
}

export async function checkNameAvailability(
  name: string,
): Promise<NameAvailabilityResult> {
  try {
    // Simulate network delay
    await new Promise((resolve) =>
      setTimeout(resolve, 1000 + Math.random() * 1000),
    )

    // Simulate random errors for some names (5% chance)
    if (Math.random() < 0.05) {
      return {
        name,
        isAvailable: false,
        error: 'Network error occurred while checking availability',
      }
    }

    // Check if name is in unavailable list
    const isUnavailable = UNAVAILABLE_NAMES.includes(name.toLowerCase())

    return {
      name,
      isAvailable: !isUnavailable,
    }
  } catch (error) {
    return {
      name,
      isAvailable: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}
