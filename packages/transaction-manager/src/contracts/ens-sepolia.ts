export const ENS_SEPOLIA_CONTRACTS = {
  // ENS Registry
  registry: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' as const,

  // ETH Registrar Controller (for .eth domains)
  ethRegistrarController: '0xfed6a969aaa60e4961fcd3ebf1a2e8913ac65b72' as const,

  // Base Registrar Implementation
  baseRegistrar: '0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85' as const,

  // Public Resolver
  publicResolver: '0x9010A27463717360cAD99CEA8bD39b8705CCA238' as const,

  // Reverse Registrar
  reverseRegistrar: '0xa58e81fe9b61b5c3fe2afd33cf304c454abfc7cb' as const,

  // Name Wrapper
  nameWrapper: '0x0635513f179d50a207757e05759cbd106d7dfce8' as const,
} as const

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