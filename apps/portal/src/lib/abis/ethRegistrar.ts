/**
 * Minimal, deploy-agnostic ABI fragments for the V2 ETHRegistrar.
 *
 * Kept local (rather than importing from `@ensdomains/ensjs-abi`) so the
 * pricing / registration / renewal paths have a single source of truth for the
 * registrar interface and no ensjs chain-config coupling.
 *
 * Signatures match `contracts-v2` (`post-audit`) — PR #286
 * (`Refactor ETHRegistrar and add ETHRenewerV1`). The registrar exposes
 * state-aware pricing: pass the label/duration/payment token and the contract
 * computes price against real registry state (premium for recently expired
 * names on register; never on renew). Reverts if the name isn't
 * registerable/renewable.
 */

/** `getRegisterPrice(label, duration, paymentToken) → (base, premium)` */
export const ethRegistrarGetRegisterPriceAbi = [
  {
    type: 'function',
    name: 'getRegisterPrice',
    stateMutability: 'view',
    inputs: [
      { name: 'label', type: 'string' },
      { name: 'duration', type: 'uint64' },
      { name: 'paymentToken', type: 'address' },
    ],
    outputs: [
      { name: 'base', type: 'uint256' },
      { name: 'premium', type: 'uint256' },
    ],
  },
] as const

/** `getRenewPrice(label, duration, paymentToken) → uint256` — renewals are exempt from premium. */
export const ethRegistrarGetRenewPriceAbi = [
  {
    type: 'function',
    name: 'getRenewPrice',
    stateMutability: 'view',
    inputs: [
      { name: 'label', type: 'string' },
      { name: 'duration', type: 'uint64' },
      { name: 'paymentToken', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

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
