/**
 * L2 Reverse Registrar contract addresses
 *
 * Simple mapping of coin types to contract addresses for mainnet and Sepolia.
 * Coin types are the same across mainnet and testnet (e.g., 42161 for Arbitrum).
 */

import type { ChainWithEns } from '@ensdomains/ensjs/chain'
import type { Address } from 'viem'

/**
 * ReverseRegistrarCoinId
 *
 * Derived from SLIP-44 coin types (ENSIP-23). For L2s, this corresponds to the EIP-155 chain ID.
 * Example:
 *  - Ethereum: coinType = 60 (not chainId 1)
 *  - Arbitrum: coinType = 42161 (same as chainId)
 */
export type ReverseRegistrarCoinId = 1 | 60 | 10 | 42161 | 8453 | 59144 | 534352

/** The two deployment environments we currently support. */
export type NetworkKey = 'mainnet' | 'sepolia'

/** Map ChainWithEns → NetworkKey, defaulting to 'sepolia' */
export function resolveNetworkFromChain(chain?: ChainWithEns): NetworkKey {
  switch (chain?.id) {
    case 1:
      return 'mainnet'
    case 11155111:
      return 'sepolia'
    default:
      // Fallback until more networks (e.g., namechain) are added
      return 'sepolia'
  }
}

/**
 * Map coin types to chain IDs for network switching
 * Note: ReverseRegistrarCoinId 60 maps to Ethereum mainnet (1) or Sepolia (11155111)
 */
export const REVERSE_REGISTRAR_CHAIN_IDS: Record<
  ReverseRegistrarCoinId,
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
 * Note: ReverseRegistrarCoinId 60 and 1 (Ethereum) use ENS.js setPrimaryName instead
 */
export const L2_REVERSE_REGISTRARS: Record<
  ReverseRegistrarCoinId,
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
} as const satisfies Record<
  ReverseRegistrarCoinId,
  { mainnet?: Address; sepolia?: Address }
>

/**
 * Get L2 Reverse Registrar address for a coin type.
 * Returns undefined for coin types 60/1 (use ENS.js setPrimaryName instead).
 *
 * @example
 * const addr = getRegistrarAddress(10)                // defaults to 'sepolia'
 * const addrMainnet = getRegistrarAddress(10, 'mainnet')
 */
export function getRegistrarAddress<
  CT extends ReverseRegistrarCoinId,
  N extends NetworkKey = 'sepolia',
>(coinType: CT, network?: N): (typeof L2_REVERSE_REGISTRARS)[CT][N] {
  const net = (network ?? 'sepolia') as N
  return L2_REVERSE_REGISTRARS[coinType][net]
}

/**
 * Get the chain ID for a coin type on a given network
 *
 * @example
 * const id = getChainIdForReverseRegistrarCoinId(8453)            // -> sepolia id
 * const idMain = getChainIdForReverseRegistrarCoinId(8453, 'mainnet')
 */
export function getChainIdForReverseRegistrarCoinId<
  CT extends ReverseRegistrarCoinId,
  N extends NetworkKey = 'sepolia',
>(coinType: CT, network?: N): (typeof REVERSE_REGISTRAR_CHAIN_IDS)[CT][N] {
  const net = (network ?? 'sepolia') as N
  return REVERSE_REGISTRAR_CHAIN_IDS[coinType][net]
}
