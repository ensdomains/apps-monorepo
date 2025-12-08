import { zeroAddress, zeroHash } from 'viem'

export const ENS_SEPOLIA_CONTRACTS = {
  // ENS Registry
  Registry: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' as const,
  // ETH Registrar Controller (for .eth domains)
  ETHRegistrarController: '0xfed6a969aaa60e4961fcd3ebf1a2e8913ac65b72' as const,
  // Base Registrar Implementation
  BaseRegistrar: '0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85' as const,
  // Public Resolver
  PublicResolver: '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5' as const,
  // Universal Resolver
  UniversalResolver: '0x2AFF1ceDDDd4c8C214ebFaAE10DBe63a8AB38400' as const,
  // Reverse Registrar
  ReverseRegistrar: '0xa58e81fe9b61b5c3fe2afd33cf304c454abfc7cb' as const,
  // Name Wrapper
  NameWrapper: '0x0635513f179d50a207757e05759cbd106d7dfce8' as const,
  // L2 Registration-specific contracts (V2 deployment)
  ETHRegistry: '0xf332544e6234f1ca149907d0d4658afd5feb6831' as const,
  ETHRegistrar: '0x774faadcd7e8c4b7441aa2927f10845fea083ea1' as const,
  // V2 Fast Registrar - no commitment wait time required
  FastTestETHRegistrar: '0x3334f0ebcbc4b5b7067f3aff25c6da8973690d54' as const,
  DedicatedResolverImpl: '0xa20b41dc7336c4d974e3c9a6ea01b77647559c46' as const,
  // Additional contracts
  BridgeController: '0xbb84d5d658bbdb48bf99689f3a14f780ab2f9220' as const,
  DedicatedResolver: '0xa20b41dc7336c4d974e3c9a6ea01b77647559c46' as const,
  HCAFactory: '0x6a20c7f050f31f4b4cb1eaf060849629be10e6a1' as const,
  MockBridge: '0xbcacc7702593e79e23f697505465b8fb344a9961' as const,
  RegistryDatastore: '0xe82b3bef599d45806fcce747df176808ff6244cf' as const,
  SimpleRegistryMetadata: '0x30eb652ab8498ee8b90e4a0553b31ed7d1c924cd' as const,
  StandardRentPriceOracle:
    '0x8067e4771d9599ba5f33fcab8d05ee18ac505b23' as const,
  UserRegistry: '0x8cfbf4a6b3f546021b9f8e6099bda2cb0297cd25' as const,
  VerifiableFactory: '0xb9541bdd86c4d01c726a33694f14e8528adcb20d' as const,
} as const

// Payment tokens
export const SUPPORTED_TOKENS = {
  USDC: '0xeb704373997b676d111e4767e281b9fb3852ecef' as const,
  DAI: '0x8817e87e865b75db8b6a7e0d882b6dcba88d913e' as const,
} as const

export const EMPTY_ADDRESS = zeroAddress
export const REFERER_ADDRESS = zeroHash
