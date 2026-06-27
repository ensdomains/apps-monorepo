export const ETH_REGISTRAR_CONTROLLER_ABI = [
  {
    inputs: [
      { internalType: 'string', name: 'label', type: 'string' },
      { internalType: 'uint256', name: 'duration', type: 'uint256' },
      { internalType: 'bytes32', name: 'referrer', type: 'bytes32' },
    ],
    name: 'renew',
    outputs: [],
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
