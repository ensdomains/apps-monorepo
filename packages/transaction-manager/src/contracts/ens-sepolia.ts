import { zeroAddress, zeroHash } from 'viem'

export const ENS_SEPOLIA_CONTRACTS = {
  // ENS Registry
  Registry: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' as const,
  // ETH Registrar Controller (for .eth domains)
  ETHRegistrarController: '0xfed6a969aaa60e4961fcd3ebf1a2e8913ac65b72' as const,
  // Public Resolver
  PublicResolver: '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5' as const,
  // Universal Resolver
  UniversalResolver: '0x50168842c0f5c9992a34085d9a6dc5b0a4f306ce' as const,
  // L2 Registration-specific contracts (V2 deployment)
  ETHRegistry: '0xf332544e6234f1ca149907d0d4658afd5feb6831' as const,
  ETHRegistrar: '0x3334f0ebcbc4b5b7067f3aff25c6da8973690d54' as const,
  // V2 Fast Registrar - no commitment wait time required (with HCAEquivalence)
  FastTestETHRegistrar: '0xe37a1366c827d18dc0ad57f3767de4b3025ceac2' as const,
  DedicatedResolverImpl: '0xa20b41dc7336c4d974e3c9a6ea01b77647559c46' as const,
  // Default reverse registrar (sets primary/default ENS name per coin type)
  DefaultReverseRegistrar:
    '0xeb8269fb39290f31c4c29cec548807ca2133abb4' as const,
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
  USDC: '0x2c3d8dfac22def2947e94432bcd6bb51e1ac55e6' as const,
  DAI: '0xd030a2465ee661338de1f02d05042bbf20d5d127' as const,
} as const

export const EMPTY_ADDRESS = zeroAddress
export const REFERER_ADDRESS = zeroHash
