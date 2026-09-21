import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import type { Address } from 'viem'
import { zeroAddress, zeroHash } from 'viem'

const ensjsSepolia = ensL1Contracts[supportedL1Chains.sepolia]

export const ENS_SEPOLIA_CONTRACTS = {
  // --- V1 (sourced from ensjs) ---
  ETHRegistrarController: ensjsSepolia.ensEthRegistrarController.address,
  ETHRenewerV1: ensjsSepolia.ensEthRenewerV1.address,
  PublicResolver: ensjsSepolia.ensPublicResolver.address,
  ReverseRegistrar: ensjsSepolia.ensReverseRegistrar.address,
  LegacyRegistry: ensjsSepolia.ensLegacyRegistry.address,

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
  // Default reverse registrar (ENSIP-19 `default.reverse`, sets the
  // primary/default ENS name per coin type). This is the registrar the
  // canonical deployment's DefaultReverseRegistrarAdapter wraps (its public
  // immutable `DEFAULT_REVERSE_REGISTRAR`, read off `0x4F32A1c6…` on Sepolia)
  // — NOT the superseded `0xeb8269fb…` standalone deployment, whose records
  // nothing in the canonical resolution path reads.
  DefaultReverseRegistrar: '0x4F382928805ba0e23B30cFB75fC9E848e82DFD47',
  // HCA forwarders for the two v1 reverse registrars (contracts-v2
  // `deployments/sepolia` @ 71a3b733). Each resolves the calling HCA's owner
  // through its STANDALONE_HCA_FACTORY, so they must match `HCAFactory` above.
  DefaultReverseRegistrarAdapter: '0x4F32A1c62E202922d4d6307126F43218DB9dA6f5',
  ReverseRegistrarAdapter: '0x39993148CAA6a20aE1F08E1b2427966E97f85aaB',
} as const

// Payment tokens accepted by the canonical V2 registrar.
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

/** Any token the apps know how to price/display. */
export type TOKEN_SYMBOL = keyof typeof TOKENS

/** Payment tokens the registrar accepts. Use this for pickers and pricing. */
export type SUPPORTED_TOKEN = keyof typeof SUPPORTED_TOKENS
export type SUPPORTED_TOKEN_ADDRESS =
  (typeof TOKENS)[SUPPORTED_TOKEN]['address']

export const EMPTY_ADDRESS = zeroAddress
export const REFERER_ADDRESS = zeroHash
