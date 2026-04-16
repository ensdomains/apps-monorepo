/**
 * L2 Reverse Registrar contract addresses (ENSv1)
 *
 * Simple mapping of coin types to contract addresses for mainnet and Sepolia.
 * Coin types are the same across mainnet and testnet (e.g., 42161 for Arbitrum).
 */

import type { Address, Chain } from 'viem'

export type ReverseRegistrarChainId =
  | 1
  | 60
  | 10
  | 42161
  | 8453
  | 59144
  | 534352

export type NetworkKey = 'mainnet' | 'sepolia'

export function resolveNetworkFromChain(chain?: Chain): NetworkKey {
  switch (chain?.id) {
    case 1:
      return 'mainnet'
    case 11155111:
      return 'sepolia'
    default:
      return 'sepolia'
  }
}

export const REVERSE_REGISTRAR_CHAIN_IDS: Record<
  ReverseRegistrarChainId,
  { mainnet: number; sepolia: number }
> = {
  1: { mainnet: 1, sepolia: 11155111 },
  60: { mainnet: 1, sepolia: 11155111 },
  10: { mainnet: 10, sepolia: 11155420 },
  42161: { mainnet: 42161, sepolia: 421614 },
  8453: { mainnet: 8453, sepolia: 84532 },
  59144: { mainnet: 59144, sepolia: 59141 },
  534352: { mainnet: 534352, sepolia: 534351 },
}

export const L2_REVERSE_REGISTRARS: Record<
  ReverseRegistrarChainId,
  { mainnet?: Address; sepolia?: Address }
> = {
  // ENSv1 ReverseRegistrar on L1
  1: {
    sepolia: '0x075703fd8f8ef6b1e8e593dacab2dd702fc28196',
  },
  60: {
    sepolia: '0x075703fd8f8ef6b1e8e593dacab2dd702fc28196',
  },
  // ENSv1 L2ReverseRegistrar on L2 chains
  10: {
    mainnet: '0x0000000000D8e504002cC26E3Ec46D81971C1664',
    sepolia: '0x6aa2f3011c428d06417e0abae5eb3841c011195d',
  },
  42161: {
    mainnet: '0x0000000000D8e504002cC26E3Ec46D81971C1664',
    sepolia: '0x6aa2f3011c428d06417e0abae5eb3841c011195d',
  },
  8453: {
    mainnet: '0x0000000000D8e504002cC26E3Ec46D81971C1664',
    sepolia: '0x6aa2f3011c428d06417e0abae5eb3841c011195d',
  },
  59144: {
    mainnet: '0x0000000000D8e504002cC26E3Ec46D81971C1664',
    sepolia: '0x6aa2f3011c428d06417e0abae5eb3841c011195d',
  },
  534352: {
    mainnet: '0x0000000000D8e504002cC26E3Ec46D81971C1664',
    sepolia: '0x6aa2f3011c428d06417e0abae5eb3841c011195d',
  },
} as const satisfies Record<
  ReverseRegistrarChainId,
  { mainnet?: Address; sepolia?: Address }
>

export function getRegistrarAddress<
  CT extends ReverseRegistrarChainId,
  N extends NetworkKey = 'sepolia',
>(coinType: CT, network?: N): (typeof L2_REVERSE_REGISTRARS)[CT][N] {
  const net = (network ?? 'sepolia') as N
  return L2_REVERSE_REGISTRARS[coinType][net]
}

export function getChainIdForReverseRegistrarChainId<
  CT extends ReverseRegistrarChainId,
  N extends NetworkKey = 'sepolia',
>(coinType: CT, network?: N): (typeof REVERSE_REGISTRAR_CHAIN_IDS)[CT][N] {
  const net = (network ?? 'sepolia') as N
  return REVERSE_REGISTRAR_CHAIN_IDS[coinType][net]
}
