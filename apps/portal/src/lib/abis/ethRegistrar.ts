/**
 * Minimal, local ABI fragments for the V2 ETHRegistrar write/availability paths
 * that haven't been migrated to ensjs yet. Pricing reads now live in
 * `@ensdomains/ensjs/public/v2` (getRegisterPrice / getRenewPrice).
 */

/** `isAvailable(label) → bool` */
export const ethRegistrarIsAvailableAbi = [
  {
    type: 'function',
    name: 'isAvailable',
    stateMutability: 'view',
    inputs: [{ name: 'label', type: 'string' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

/** `renew(label, duration, paymentToken, referrer)` */
export const ethRegistrarRenewAbi = [
  {
    type: 'function',
    name: 'renew',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'label', type: 'string' },
      { name: 'duration', type: 'uint64' },
      { name: 'paymentToken', type: 'address' },
      { name: 'referrer', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const
