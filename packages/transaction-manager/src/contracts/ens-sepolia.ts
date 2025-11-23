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
  UniversalResolver: '0x352d7aA7a8bd0F6f31635BE5ceCb6Cebb6929A15' as const,

  // Reverse Registrar
  ReverseRegistrar: '0xa58e81fe9b61b5c3fe2afd33cf304c454abfc7cb' as const,

  // Name Wrapper
  NameWrapper: '0x0635513f179d50a207757e05759cbd106d7dfce8' as const,

  // Registration-specific contracts (from manager app)
  ETHRegistry: '0x5fb63bbd34de21688c8aa8131be1c3b4a477109c' as const,
  ETHRegistrar: '0x774faadcd7e8c4b7441aa2927f10845fea083ea1' as const,
  FastTestETHRegistrar: '0xb08b6a514d54562ef3b7470bdb709c4eb135c535' as const,
} as const

// Payment tokens
export const SUPPORTED_TOKENS = {
  USDC: '0x9028ab8e872af36c30c959a105cb86d1038412ae' as const,
  DAI: '0x6630589c2e6364a96bb7acf0d9d64ac9c1dd3528' as const,
} as const

export const EMPTY_ADDRESS = zeroAddress
export const REFERER_ADDRESS = zeroHash

// ETH Registrar Controller ABI (only renewal function)
export const ETH_REGISTRAR_CONTROLLER_ABI = [
  {
    inputs: [
      { internalType: 'string', name: 'name', type: 'string' },
      { internalType: 'uint256', name: 'duration', type: 'uint256' },
    ],
    name: 'renew',
    outputs: [{ internalType: 'uint256', name: 'cost', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'string', name: 'name', type: 'string' },
      { internalType: 'uint256', name: 'duration', type: 'uint256' },
    ],
    name: 'rentPrice',
    outputs: [
      {
        components: [
          { internalType: 'uint256', name: 'base', type: 'uint256' },
          { internalType: 'uint256', name: 'premium', type: 'uint256' },
        ],
        internalType: 'struct IPriceOracle.Price',
        name: 'price',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const
