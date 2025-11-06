/**
 * L2 Reverse Registrar contract addresses
 *
 * Simple mapping of coin types to contract addresses for mainnet and Sepolia.
 * Coin types are the same across mainnet and testnet (e.g., 42161 for Arbitrum).
 */

import type { Address } from 'viem'

/**
 * Supported coin types (ENSIP-23)
 * These are the same for mainnet and Sepolia
 */
export type CoinType = 1 | 60 | 10 | 42161 | 8453 | 59144 | 534352

/**
 * Map coin types to chain IDs for network switching
 * Note: CoinType 60 maps to Ethereum mainnet (1) or Sepolia (11155111)
 */
export const COIN_TYPE_TO_CHAIN_ID: Record<
  CoinType,
  { mainnet: number; sepolia: number }
> = {
  1: { mainnet: 1, sepolia: 11155111 }, // Ethereum
  60: { mainnet: 1, sepolia: 11155111 }, // Default (Ethereum)
  10: { mainnet: 10, sepolia: 11155420 }, // Optimism
  42161: { mainnet: 42161, sepolia: 421614 }, // Arbitrum
  8453: { mainnet: 8453, sepolia: 84532 }, // Base
  59144: { mainnet: 59144, sepolia: 59141 }, // Linea
  534352: { mainnet: 534352, sepolia: 534351 }, // Scroll
}

/**
 * L2 Reverse Registrar contract addresses
 * Indexed by coin type, with mainnet and sepolia addresses
 * Note: CoinType 60 and 1 (Ethereum) use ENS.js setPrimaryName instead
 */
export const L2_REVERSE_REGISTRARS: Record<
  CoinType,
  { mainnet?: Address; sepolia?: Address }
> = {
  // Ethereum - uses ENS.js setPrimaryName
  1: {},
  // Default - uses ENS.js setPrimaryName
  60: {},
  // Optimism
  10: {
    mainnet: '0x0000000000D8e504002cC26E3Ec46D81971C1664',
    sepolia: '0x00000BeEF055f7934784D6d81b6BC86665630dbA',
  },
  // Arbitrum
  42161: {
    mainnet: '0x0000000000D8e504002cC26E3Ec46D81971C1664',
    sepolia: '0x00000BeEF055f7934784D6d81b6BC86665630dbA',
  },
  // Base
  8453: {
    mainnet: '0x0000000000D8e504002cC26E3Ec46D81971C1664',
    sepolia: '0x00000BeEF055f7934784D6d81b6BC86665630dbA',
  },
  // Linea
  59144: {
    mainnet: '0x0000000000D8e504002cC26E3Ec46D81971C1664',
    sepolia: '0x00000BeEF055f7934784D6d81b6BC86665630dbA',
  },
  // Scroll
  534352: {
    mainnet: '0x0000000000D8e504002cC26E3Ec46D81971C1664',
    sepolia: '0x00000BeEF055f7934784D6d81b6BC86665630dbA',
  },
} as const satisfies Record<CoinType, { mainnet?: Address; sepolia?: Address }>
/**
 * Get L2 Reverse Registrar address for a coin type
 * Returns undefined for coinType 60/1 (use ENS.js setPrimaryName instead)
 *
 * @example
 * const address = getRegistrarAddress(10, false) // Type: '0x0000000000D8e504002cC26E3Ec46D81971C1664'
 * const testAddress = getRegistrarAddress(10, true) // Type: '0x00000BeEF055f7934784D6d81b6BC86665630dbA'
 */
export function getRegistrarAddress<
  CT extends CoinType,
  IsTestnet extends boolean = false,
>(
  coinType: CT,
  isTestnet?: IsTestnet,
): (typeof L2_REVERSE_REGISTRARS)[CT][IsTestnet extends true
  ? 'sepolia'
  : 'mainnet'] {
  const network = (isTestnet ? 'sepolia' : 'mainnet') as IsTestnet extends true
    ? 'sepolia'
    : 'mainnet'
  return L2_REVERSE_REGISTRARS[coinType][network]
}

/**
 * Get the chain ID for a coin type
 */
export function getChainIdForCoinType(
  coinType: CoinType,
  isTestnet = false,
): number {
  const network = isTestnet ? 'sepolia' : 'mainnet'
  return COIN_TYPE_TO_CHAIN_ID[coinType][network]
}
