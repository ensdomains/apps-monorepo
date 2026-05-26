import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import type { Address } from 'viem'
import { zeroAddress, zeroHash } from 'viem'

const ensjsSepolia = ensL1Contracts[supportedL1Chains.sepolia]

export const ENS_SEPOLIA_CONTRACTS = {
  // --- V1 (sourced from ensjs) ---
  ETHRegistrarController: ensjsSepolia.ensEthRegistrarController.address,
  PublicResolver: ensjsSepolia.ensPublicResolver.address,
  ReverseRegistrar: ensjsSepolia.ensReverseRegistrar.address,

  // --- V2 (sourced from ensjs) ---
  ETHRegistry: ensjsSepolia.ensRegistry.address,
  ETHRegistrar: ensjsSepolia.ensEthRegistrar.address,
  DedicatedResolverImpl: ensjsSepolia.ensPermissionedResolverImpl.address,
  VerifiableFactory: ensjsSepolia.ensVerifiableFactory.address,

  // --- Not (yet) in ensjs chain definitions; canonical Sepolia V2 deployments ---
  // Default reverse registrar (sets primary/default ENS name per coin type)
  DefaultReverseRegistrar: '0xeb8269fb39290f31c4c29cec548807ca2133abb4',
  // Standard Rent Price Oracle used by the production ETHRegistrar. Resolved
  // at runtime via `ETHRegistrar.rentPriceOracle()` when possible — this
  // constant is the source of truth for the *current* sepolia deployment.
  StandardRentPriceOracle: '0xe19d37839f42f7d2694d8c5712f412c66a218161',
  // HCA Factory
  HCAFactory: '0x358680728dedb552adaa9f5eb5d4395b291cf943',
} as const

// Payment tokens. USDC comes from ensjs chain config; DAI is the canonical
// sepolia MockDAI deployment that's whitelisted on the current ETHRegistrar /
// StandardRentPriceOracle. ensjs doesn't (yet) carry a DAI entry for sepolia,
// so this is the one hardcoded address we still need to maintain here — when
// the V2 deployment changes the whitelisted DAI, this is the single source to
// update.
export const SUPPORTED_TOKENS = {
  USDC: ensjsSepolia.usdc.address,
  DAI: '0xe915cebbc1570a74177b6c589fed1e8f53117559',
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
