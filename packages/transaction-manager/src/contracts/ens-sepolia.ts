import { zeroAddress, zeroHash } from 'viem'

export const ENS_SEPOLIA_CONTRACTS = {
  // ENS Registry
  Registry: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' as const,
  // ETH Registrar Controller (for .eth domains)
  ETHRegistrarController: '0xfed6a969aaa60e4961fcd3ebf1a2e8913ac65b72' as const,
  // Public Resolver
  PublicResolver: '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5' as const,
  // Universal Resolver
  UniversalResolver: '0x2AFF1ceDDDd4c8C214ebFaAE10DBe63a8AB38400' as const,
  // L2 Registration-specific contracts (V2 deployment)
  ETHRegistry: '0x0f3eb298470639a96bd548cea4a648bc80b2cee2' as const,
  ETHRegistrar: '0x774faadcd7e8c4b7441aa2927f10845fea083ea1' as const,
  // V2 Fast Registrar - no commitment wait time required
  FastTestETHRegistrar: '0x3334f0ebcbc4b5b7067f3aff25c6da8973690d54' as const,
} as const

// Payment tokens
export const SUPPORTED_TOKENS = {
  USDC: '0x9028ab8e872af36c30c959a105cb86d1038412ae' as const,
  DAI: '0x6630589c2e6364a96bb7acf0d9d64ac9c1dd3528' as const,
} as const

export const EMPTY_ADDRESS = zeroAddress
export const REFERER_ADDRESS = zeroHash
