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

  {
    type: 'function',
    name: 'getDiscountPoints',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 't', type: 'uint64' },
          { name: 'value', type: 'uint128' },
        ],
      },
    ],
  },

  {
    type: 'function',
    name: 'premiumPriceInitial',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },

  {
    type: 'function',
    name: 'premiumHalvingPeriod',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint64' }],
  },

  {
    type: 'function',
    name: 'premiumPeriod',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint64' }],
  },
] as const satisfies Abi
