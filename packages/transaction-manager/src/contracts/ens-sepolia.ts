import { zeroAddress, zeroHash } from 'viem'

export const ENS_SEPOLIA_CONTRACTS = {
  // ENS Legacy Registry (V1)
  Registry: '0x17795c119b8155ab9d3357c77747ba509695d7cb' as const,
  // ENS Registry (V2)
  ETHRegistry: '0x31a2bb5d933557cce1b3129993193896d074db92' as const,
  // ETH Registrar Controller (V1, unchanged across forks)
  ETHRegistrarController: '0x99e517db3db5ec5424367b8b50cd11ddcb0008f1' as const,
  // ETH Registrar (V2) — canonical v2 registrar on the tenderly fork
  ETHRegistrar: '0x26e5e80e8f36607ef401443fb34eea363c86e8f7' as const,
  // Fast Test ETH Registrar (only present on test deployments with
  // MIN_COMMITMENT_AGE=0). Kept for completeness; the registration flow now
  // always uses the canonical ETHRegistrar so it works on any deployment.
  FastTestETHRegistrar: '0xbbf892aea9bb883b36bab2adc7831a6c63ef1e39' as const,
  // Dedicated Resolver Implementation (PermissionedResolver impl behind the
  // verifiable proxy — kept stable across fork redeploys)
  DedicatedResolverImpl: '0xe566a1fbaf30ff7c39828fe99f955fc55544cb9c' as const,
  // Verifiable Factory
  VerifiableFactory: '0x26997c9d0f3dcbae3f78c69e621a3926ee30bb98' as const,
  // Default reverse registrar (sets primary/default ENS name per coin type)
  DefaultReverseRegistrar:
    '0xeb8269fb39290f31c4c29cec548807ca2133abb4' as const,
  ReverseRegistrar: '0x075703fd8f8ef6b1e8e593dacab2dd702fc28196' as const,
  // Standard Rent Price Oracle
  StandardRentPriceOracle:
    '0x20a494e8a6ce80826477dd1d468337b990d71795' as const,
  // HCA Factory
  HCAFactory: '0xb6fb46e1458915dd828633d91e1df8e4c3f2d4dd' as const,
  // Public Resolver (V1, unchanged)
  PublicResolver: '0x640294a2b2d87e7f522db3e3e3e876764bce170d' as const,
} as const

// Payment tokens (Mock tokens on Sepolia fork)
export const SUPPORTED_TOKENS = {
  USDC: '0xf2942507cb33422a800ff9aa4cb05522a5e1d9e6' as const,
  DAI: '0xb21412bb6816601dd840b93a5d19a8fe671cb74e' as const,
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
