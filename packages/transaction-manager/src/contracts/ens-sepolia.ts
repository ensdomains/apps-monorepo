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

  // --- V2 (Sepolia deployment — contracts-v2) ---
  ETHRegistry: '0x64c81210d0e580cfc7746f3fb910bf0e8f6378e1',
  ETHRegistrar: '0xb68e594a47fe057bd31e7a8229ffcfd85b2e28af',
  // DedicatedResolverImpl is the PermissionedResolverImpl in this deployment.
  DedicatedResolverImpl: '0xaccbdb224df4110c86441f8f2b967af19e60e6e0',
  VerifiableFactory: '0x7dd7f5b46005c11c89ec3eeecbfcce6234ef5a36',

  // --- Not in ensjs chain definitions; canonical Sepolia V2 deployments ---
  // No fast-test registrar on Sepolia (no MIN_COMMITMENT_AGE=0 variant); the fast
  // path is gated off (useFastRegistrar=false), so this points at the real
  // ETHRegistrar as a safe fallback.
  FastTestETHRegistrar: '0xb68e594a47fe057bd31e7a8229ffcfd85b2e28af',
  // Default reverse registrar (sets primary/default ENS name per coin type).
  // NOTE: not part of the V2 deployment list — verify before using the
  // set-primary-name flow on Sepolia.
  DefaultReverseRegistrar: '0xeb8269fb39290f31c4c29cec548807ca2133abb4',
  // Standard Rent Price Oracle
  StandardRentPriceOracle: '0xf33d548997e2975c8ff04f66219564d8c7a95e26',
  // HCA Factory
  HCAFactory: '0x4327e31b4111dc0fb54517cd0fed82680840f32e',
} as const

// Payment tokens — Sepolia deployment (MockUSDC / MockDAI).
export const SUPPORTED_TOKENS = {
  USDC: '0x6fdfd2a902ae83a1617abc47eec6d9d2cbe7d38e',
  DAI: '0xa4e569b57e0d6ac518c73ebdaa67e11c96dbd7a4',
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
