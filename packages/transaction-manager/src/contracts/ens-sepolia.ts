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
  // The V2 resolver implementation proxied by VerifiableFactory. This is
  // `PermissionedResolver` — NOT namechain's `DedicatedResolver`, which is a
  // different contract with its own interface id (0x92349baa).
  PermissionedResolverImpl: ensjsSepolia.ensPermissionedResolverImpl.address,
  VerifiableFactory: ensjsSepolia.ensVerifiableFactory.address,
  StandardRentPriceOracle: ensjsSepolia.ensStandardRentPriceOracle.address,
  HCAFactory: ensjsSepolia.ensHcaFactory.address,

  // --- Not (yet) in ensjs chain definitions; canonical Sepolia V2 deployment ---
  // Default reverse registrar (sets primary/default ENS name per coin type)
  DefaultReverseRegistrar: '0xeb8269fb39290f31c4c29cec548807ca2133abb4',
} as const

// Payment tokens the V2 registrar actually accepts (its PAYMENT_TOKEN /
// SECONDARY_PAYMENT_TOKEN slots). DAI is deliberately absent: offering it in a
// picker produces quotes the registrar rejects at settlement.
export const SUPPORTED_TOKENS = {
  USDC: ensjsSepolia.usdc.address,
} as const satisfies Record<'USDC', Address>

// Metadata for every token the apps can price/display. Broader than
// `SUPPORTED_TOKENS` because apps/portal still offers DAI in its own picker.
// Adding an entry here does NOT make it a valid payment token.
export const TOKENS = {
  USDC: {
    address: SUPPORTED_TOKENS.USDC,
    decimals: 6,
    symbol: 'USDC',
  },
  DAI: {
    address: ensjsSepolia.dai.address,
    decimals: 18,
    symbol: 'DAI',
  },
} as const

/** Any token the apps know how to price/display — includes portal's DAI. */
export type TOKEN_SYMBOL = keyof typeof TOKENS

/** Payment tokens the registrar accepts. Use this for pickers and pricing. */
export type SUPPORTED_TOKEN = keyof typeof SUPPORTED_TOKENS
export type SUPPORTED_TOKEN_ADDRESS =
  (typeof TOKENS)[SUPPORTED_TOKEN]['address']

export const EMPTY_ADDRESS = zeroAddress
export const REFERER_ADDRESS = zeroHash
