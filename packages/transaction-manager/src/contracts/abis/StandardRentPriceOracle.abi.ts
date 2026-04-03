import type { Abi } from 'viem'

export const STANDARD_RENT_PRICE_ORACLE_ABI = [
  {
    type: 'function',
    name: 'rentPrice',
    constant: false,
    stateMutability: 'view',
    inputs: [
      {
        name: 'label',
        type: 'string',
      },
      {
        name: 'owner',
        type: 'address',
      },
      {
        name: 'duration',
        type: 'uint64',
      },
      {
        name: 'paymentToken',
        type: 'address',
      },
    ],
    outputs: [
      {
        name: 'base',
        type: 'uint256',
      },
      {
        name: 'premium',
        type: 'uint256',
      },
    ],
  },

  {
    type: 'function',
    name: 'getBaseRates',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256[]',
      },
    ],
  },
] as const satisfies Abi
