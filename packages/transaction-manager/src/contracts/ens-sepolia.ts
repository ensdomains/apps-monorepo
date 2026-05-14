import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import type { Address } from 'viem'
import { zeroAddress, zeroHash } from 'viem'

const ensjsSepolia = ensL1Contracts[supportedL1Chains.sepolia]

export const ENS_SEPOLIA_CONTRACTS = {
  // --- V1 (sourced from ensjs) ---
  Registry: ensjsSepolia.ensLegacyRegistry.address,
  ETHRegistrarController: ensjsSepolia.ensEthRegistrarController.address,
  PublicResolver: ensjsSepolia.ensPublicResolver.address,
  ReverseRegistrar: ensjsSepolia.ensReverseRegistrar.address,

  // --- V2 (Tenderly virtual Sepolia deployment — contracts-v2 PR #301) ---
  // NOTE: Tenderly-fork-specific addresses; do not merge to `main`.
  ETHRegistry: '0x31a2bb5d933557cce1b3129993193896d074db92',
  ETHRegistrar: '0x26e5e80e8f36607ef401443fb34eea363c86e8f7',
  DedicatedResolverImpl: '0x73bad0460ef02b8d6a9de17550218e9e20663c19',
  VerifiableFactory: '0x26997c9d0f3dcbae3f78c69e621a3926ee30bb98',

  // --- Not (yet) in ensjs chain definitions; canonical Sepolia V2 deployments ---
  // Fast Test ETH Registrar (test deployments with MIN_COMMITMENT_AGE=0).
  FastTestETHRegistrar: '0xbbf892aea9bb883b36bab2adc7831a6c63ef1e39',
  // Default reverse registrar (sets primary/default ENS name per coin type)
  DefaultReverseRegistrar: '0xeb8269fb39290f31c4c29cec548807ca2133abb4',
  // Standard Rent Price Oracle
  StandardRentPriceOracle: '0x20a494e8a6ce80826477dd1d468337b990d71795',
  // HCA Factory
  HCAFactory: '0xb6fb46e1458915dd828633d91e1df8e4c3f2d4dd',
} as const

// Payment tokens — Tenderly virtual Sepolia deployment (MockUSDC / MockDAI).
export const SUPPORTED_TOKENS = {
  USDC: '0xf2942507cb33422a800ff9aa4cb05522a5e1d9e6',
  DAI: '0xb21412bb6816601dd840b93a5d19a8fe671cb74e',
} as const satisfies Record<'USDC' | 'DAI', Address>

export const TOKENS = {
  USDC: {
    address: SUPPORTED_TOKENS.USDC,
    decimals: 6,
    symbol: 'USDC',
  },
  DAI: {
    address: SUPPORTED_TOKENS.DAI,
    decimals: 18,
    symbol: 'DAI',
  },
} as const

export type SUPPORTED_TOKEN = keyof typeof TOKENS
export type SUPPORTED_TOKEN_ADDRESS =
  (typeof TOKENS)[SUPPORTED_TOKEN]['address']

export const EMPTY_ADDRESS = zeroAddress
export const REFERER_ADDRESS = zeroHash
