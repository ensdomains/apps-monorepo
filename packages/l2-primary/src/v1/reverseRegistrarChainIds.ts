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
  // ENSv1 ReverseRegistrar on L1. Addresses sourced from
  // `ens-contracts/deployments/{mainnet,sepolia}/ReverseRegistrar.json`.
  1: {
    mainnet: '0xa58E81fe9b61B5c3fE2AFD33CF304c454AbFc7Cb',
    sepolia: '0xA0a1AbcDAe1a2a4A2EF8e9113Ff0e02DD81DC0C6',
  },
  60: {
    mainnet: '0xa58E81fe9b61B5c3fE2AFD33CF304c454AbFc7Cb',
    sepolia: '0xA0a1AbcDAe1a2a4A2EF8e9113Ff0e02DD81DC0C6',
  },
  // ENSv1 L2ReverseRegistrar on L2 chains. The contract is deployed at the
  // same address on every supported L2 within a given environment (via
  // CREATE2 / deterministic deployment). Addresses sourced from
  // `ens-contracts/deployments/{optimism,arbitrum,base,linea,scroll}{,Sepolia}/L2ReverseRegistrar.json`
  // and verified on-chain by reading `coinType()` against the ENSIP-19
  // chain coin type.
  10: {
    mainnet: '0x0000000000D8e504002cC26E3Ec46D81971C1664',
    sepolia: '0x00000BeEF055f7934784D6d81b6BC86665630dbA',
  },
  42161: {
    mainnet: '0x0000000000D8e504002cC26E3Ec46D81971C1664',
    sepolia: '0x00000BeEF055f7934784D6d81b6BC86665630dbA',
  },
  8453: {
    mainnet: '0x0000000000D8e504002cC26E3Ec46D81971C1664',
    sepolia: '0x00000BeEF055f7934784D6d81b6BC86665630dbA',
  },
  59144: {
    mainnet: '0x0000000000D8e504002cC26E3Ec46D81971C1664',
    sepolia: '0x00000BeEF055f7934784D6d81b6BC86665630dbA',
  },
  534352: {
    mainnet: '0x0000000000D8e504002cC26E3Ec46D81971C1664',
    sepolia: '0x00000BeEF055f7934784D6d81b6BC86665630dbA',
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
