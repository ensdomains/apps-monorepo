import type { Abi } from 'viem'

/**
 * Minimal ABI for the StandardRentPriceOracle. Only `getBaseRates` is kept here
 * (consumed by the manager app); the portal's oracle reads — applyDiscount,
 * getPremiumDecayParams, isPaymentToken — now live in `@ensdomains/ensjs/public/v2`.
 */
export const STANDARD_RENT_PRICE_ORACLE_ABI = [
  {
    type: 'function',
    name: 'getBaseRates',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
] as const satisfies Abi
