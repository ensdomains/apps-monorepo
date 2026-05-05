import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import type { Address } from 'viem'
import { zeroAddress, zeroHash } from 'viem'

const ensjsSepolia = ensL1Contracts[supportedL1Chains.sepolia]

export const ENS_SEPOLIA_CONTRACTS = {
  // --- V1 (sourced from ensjs) ---
  Registry: ensjsSepolia.ensLegacyRegistry.address as Address,
  ETHRegistrarController: ensjsSepolia.ensEthRegistrarController
    .address as Address,
  PublicResolver: ensjsSepolia.ensPublicResolver.address as Address,
  ReverseRegistrar: ensjsSepolia.ensReverseRegistrar.address as Address,

  // --- V2 (sourced from ensjs) ---
  ETHRegistry: ensjsSepolia.ensRegistry.address as Address,
  ETHRegistrar: ensjsSepolia.ensEthRegistrar.address as Address,
  DedicatedResolverImpl: ensjsSepolia.ensPermissionedResolverImpl
    .address as Address,
  VerifiableFactory: ensjsSepolia.ensVerifiableFactory.address as Address,

  // --- Not (yet) in ensjs chain definitions; canonical Sepolia V2 deployments ---
  // Fast Test ETH Registrar (test deployments with MIN_COMMITMENT_AGE=0).
  FastTestETHRegistrar: '0xbbf892aea9bb883b36bab2adc7831a6c63ef1e39' as Address,
  // Default reverse registrar (sets primary/default ENS name per coin type)
  DefaultReverseRegistrar:
    '0xeb8269fb39290f31c4c29cec548807ca2133abb4' as Address,
  // Standard Rent Price Oracle
  StandardRentPriceOracle:
    '0x6e5b8a907ed46a15869b9a19f6961781d6af2270' as Address,
  // HCA Factory
  HCAFactory: '0x12919bd18e9eb9f004e2faf78709d0319747d761' as Address,
} as const

// Payment tokens (USDC sourced from ensjs; MockDAI on Sepolia)
export const SUPPORTED_TOKENS = {
  USDC: ensjsSepolia.usdc.address as Address,
  DAI: '0xa01e0eb02d0e92f1302e677d7ce7955b35c390d4' as Address,
} as const

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
