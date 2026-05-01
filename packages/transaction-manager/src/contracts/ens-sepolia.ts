import { zeroAddress, zeroHash } from 'viem'

export const ENS_SEPOLIA_CONTRACTS = {
  // ENS Legacy Registry (V1)
  Registry: '0x17795c119b8155ab9d3357c77747ba509695d7cb' as const,
  // ENS Registry (V2)
  ETHRegistry: '0x796fff2e907449be8d5921bcc215b1b76d89d080' as const,
  // ETH Registrar Controller
  ETHRegistrarController: '0x99e517db3db5ec5424367b8b50cd11ddcb0008f1' as const,
  // ETH Registrar (V2) — canonical v2 registrar on the tenderly fork
  ETHRegistrar: '0x29e8a042ea34b7ee720c12b52720027b5e9049c6' as const,
  // Fast Test ETH Registrar (only present on test deployments with
  // MIN_COMMITMENT_AGE=0). Kept for completeness; the registration flow now
  // always uses the canonical ETHRegistrar so it works on any deployment.
  FastTestETHRegistrar: '0xbbf892aea9bb883b36bab2adc7831a6c63ef1e39' as const,
  // Dedicated Resolver Implementation
  DedicatedResolverImpl: '0xe566a1fbaf30ff7c39828fe99f955fc55544cb9c' as const,
  // Verifiable Factory
  VerifiableFactory: '0x9240c5f31d747d60b3d9aed2f57995094342b1ed' as const,
  // Default reverse registrar (sets primary/default ENS name per coin type)
  DefaultReverseRegistrar:
    '0xeb8269fb39290f31c4c29cec548807ca2133abb4' as const,
  ReverseRegistrar: '0x075703fd8f8ef6b1e8e593dacab2dd702fc28196' as const,
  // Standard Rent Price Oracle
  StandardRentPriceOracle:
    '0x6e5b8a907ed46a15869b9a19f6961781d6af2270' as const,
  // HCA Factory
  HCAFactory: '0x12919bd18e9eb9f004e2faf78709d0319747d761' as const,
  // Public Resolver
  PublicResolver: '0x640294a2b2d87e7f522db3e3e3e876764bce170d' as const,
} as const

// Payment tokens (Mock tokens on Sepolia)
export const SUPPORTED_TOKENS = {
  USDC: '0xc39c1eec68a9e3c08c4f6cbebbb0fbf7aa4be06b' as const,
  DAI: '0xa1ad79c31e9e8c4d2d0b73aaf0435a7a8a706170' as const,
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
