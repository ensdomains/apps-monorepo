/**
 * Minimal, deploy-agnostic ABI fragments for the V2 ETHRegistrar.
 *
 * Kept local (rather than importing from `@ensdomains/ensjs-abi`) so the
 * pricing / registration / renewal paths have a single source of truth for the
 * registrar interface and no ensjs chain-config coupling. Signatures verified
 * against the deployed contract.
 */

/** `rentPrice(label, owner, duration, paymentToken) → (base, premium)` */
export const ethRegistrarRentPriceAbi = [
  {
    type: 'function',
    name: 'rentPrice',
    stateMutability: 'view',
    inputs: [
      { name: 'label', type: 'string' },
      { name: 'owner', type: 'address' },
      { name: 'duration', type: 'uint64' },
      { name: 'paymentToken', type: 'address' },
    ],
    outputs: [
      { name: 'base', type: 'uint256' },
      { name: 'premium', type: 'uint256' },
    ],
  },
] as const
