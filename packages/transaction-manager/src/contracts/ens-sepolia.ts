import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import type { Address } from 'viem'
import { zeroAddress, zeroHash } from 'viem'

const ensjsSepolia = ensL1Contracts[supportedL1Chains.sepolia]

export const ENS_SEPOLIA_CONTRACTS = {
  // --- V1 (sourced from ensjs) ---
  ETHRegistrarController: ensjsSepolia.ensEthRegistrarController.address,
  PublicResolver: ensjsSepolia.ensPublicResolver.address,
  ReverseRegistrar: ensjsSepolia.ensReverseRegistrar.address,

  // --- V2 (sourced from ensjs chain config) ---
  ETHRegistry: ensjsSepolia.ensRegistry.address,
  ETHRegistrar: ensjsSepolia.ensEthRegistrar.address,
  // DedicatedResolverImpl is ensjs's PermissionedResolverImpl.
  DedicatedResolverImpl: ensjsSepolia.ensPermissionedResolverImpl.address,
  VerifiableFactory: ensjsSepolia.ensVerifiableFactory.address,
  StandardRentPriceOracle: ensjsSepolia.ensStandardRentPriceOracle.address,
  HCAFactory: ensjsSepolia.ensHcaFactory.address,

  // --- Not (yet) in ensjs chain definitions; canonical Sepolia V2 deployment ---
  // Default reverse registrar (sets primary/default ENS name per coin type)
  DefaultReverseRegistrar: '0xeb8269fb39290f31c4c29cec548807ca2133abb4',
} as const

// Payment tokens — sourced from ensjs chain config (MockUSDC / MockDAI).
export const SUPPORTED_TOKENS = {
  USDC: ensjsSepolia.usdc.address,
  DAI: ensjsSepolia.dai.address,
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
