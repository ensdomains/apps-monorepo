import type { Abi } from 'viem'

/**
 * Minimal ABI for the post-audit StandardRentPriceOracle (contracts-v2
 * `post-audit`, PR #286). The pre-audit `rentPrice` / `integratedDiscount` /
 * lowercase `premium*` getters were removed; pricing is now exposed via
 * `getBasePrice` + `applyDiscount` and the premium params are immutable
 * UPPERCASE getters. Only the fragments the apps actually call are included.
 */
export const STANDARD_RENT_PRICE_ORACLE_ABI = [
  {
    type: 'function',
    name: 'getBaseRates',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256[]' }],
  },

  {
    type: 'function',
    name: 'getBasePrice',
    stateMutability: 'view',
    inputs: [
      { name: 'label', type: 'string' },
      { name: 'duration', type: 'uint64' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },

  {
    type: 'function',
    name: 'applyDiscount',
    stateMutability: 'view',
    inputs: [
      { name: 'value', type: 'uint256' },
      { name: 'duration', type: 'uint64' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
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
          { name: 'duration', type: 'uint64' },
          { name: 'numer', type: 'uint128' },
        ],
      },
    ],
  },

  {
    type: 'function',
    name: 'getPremiumPriceAfter',
    stateMutability: 'view',
    inputs: [{ name: 'duration', type: 'uint64' }],
    outputs: [{ name: '', type: 'uint256' }],
  },

  {
    type: 'function',
    name: 'convertUnits',
    stateMutability: 'view',
    inputs: [
      { name: 'value', type: 'uint256' },
      { name: 'paymentToken', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },

  {
    type: 'function',
    name: 'isPaymentToken',
    stateMutability: 'view',
    inputs: [{ name: 'paymentToken', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },

  {
    type: 'function',
    name: 'PREMIUM_PRICE_INITIAL',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },

  {
    type: 'function',
    name: 'PREMIUM_HALVING_PERIOD',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint64' }],
  },

  {
    type: 'function',
    name: 'PREMIUM_PERIOD',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint64' }],
  },

  {
    type: 'function',
    name: 'DISCOUNT_DENOMINATOR',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint128' }],
  },
] as const satisfies Abi
