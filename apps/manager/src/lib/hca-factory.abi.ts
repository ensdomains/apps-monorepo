/**
 * HCA Factory ABIs
 *
 * Interfaces for the Hidden Contract Account (HCA) Factory and the
 * minimal "deferred" implementation that sits behind a newly-created
 * HCA proxy until its owner upgrades it to a real account
 * implementation.
 *
 * Sourced verbatim from `ensdomains/contracts-v2`:
 *   - `contracts/src/hca/HCAFactory.sol`
 *   - `contracts/src/hca/HCADeferredImplementation.sol`
 *
 * The HCA model is "EOA → CREATE3-deterministic ERC-1967 proxy whose
 * implementation slot the EOA can swap." The factory is the only entity
 * that ever writes the `(hca → owner)` mapping, and it does so atomically
 * inside `createAccount(initData)` from the owner encoded in `initData`.
 * There is no `setAccountOwner` — an earlier mock had one; the real
 * factory does not.
 *
 * Once we mirror these ABIs into `@ensdomains/ensjs-abi/src/v2/`, this
 * file can be deleted in favour of importing from there.
 */

/**
 * `HCAFactory` — deploys deterministic HCA proxies and exposes the
 * `(hca → owner)` lookup that `HCAEquivalence` uses to resolve a
 * smart-account caller back to its EOA.
 *
 * Live Sepolia deployment: `0x358680728dedb552adaa9f5eb5d4395b291cf943`.
 */
export const HCA_FACTORY_ABI = [
  {
    type: 'constructor',
    inputs: [
      { name: 'implementation_', type: 'address', internalType: 'address' },
      {
        name: 'initDataParser_',
        type: 'address',
        internalType: 'contract IHCAInitDataParser',
      },
      { name: 'owner_', type: 'address', internalType: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'DEFERRED_IMPLEMENTATION',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'accountHCAOf',
    inputs: [{ name: 'account', type: 'address', internalType: 'address' }],
    outputs: [{ name: 'hca', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'accountImplementationOf',
    inputs: [{ name: 'account', type: 'address', internalType: 'address' }],
    outputs: [
      {
        name: 'accountImplementation',
        type: 'address',
        internalType: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'computeAccountAddress',
    inputs: [{ name: 'owner', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'address', internalType: 'address payable' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'createAccount',
    inputs: [{ name: 'initData', type: 'bytes', internalType: 'bytes' }],
    outputs: [
      { name: 'hca', type: 'address', internalType: 'address payable' },
    ],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'getAccountOwner',
    inputs: [{ name: 'hca', type: 'address', internalType: 'address' }],
    outputs: [{ name: 'hcaOwner', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getOwnerFromHCAInitdata',
    inputs: [{ name: 'initData', type: 'bytes', internalType: 'bytes' }],
    outputs: [{ name: 'hcaOwner', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'implementation',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'initDataParser',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'contract IHCAInitDataParser',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'owner',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'renounceOwnership',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setAccountImplementation',
    inputs: [
      {
        name: 'accountImplementation',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setImplementation',
    inputs: [
      { name: 'implementation_', type: 'address', internalType: 'address' },
      {
        name: 'initDataParser_',
        type: 'address',
        internalType: 'contract IHCAInitDataParser',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'transferOwnership',
    inputs: [{ name: 'newOwner', type: 'address', internalType: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'AccountCreated',
    inputs: [
      {
        name: 'hcaOwner',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'hca',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'AccountImplementationSet',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'implementation',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'NewHCAImplementation',
    inputs: [
      {
        name: 'accountImplementation',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'initDataParser',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'OwnershipTransferred',
    inputs: [
      {
        name: 'previousOwner',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'newOwner',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  { type: 'error', name: 'EthTransferFailed', inputs: [] },
  {
    type: 'error',
    name: 'HCAImplementationNotSelectable',
    inputs: [
      { name: 'implementation', type: 'address', internalType: 'address' },
    ],
  },
  {
    type: 'error',
    name: 'OwnableInvalidOwner',
    inputs: [{ name: 'owner', type: 'address', internalType: 'address' }],
  },
  {
    type: 'error',
    name: 'OwnableUnauthorizedAccount',
    inputs: [{ name: 'account', type: 'address', internalType: 'address' }],
  },
] as const

/**
 * `HCADeferredImplementation` — the implementation a newly-created HCA
 * proxy points at when its owner hasn't selected a real account
 * implementation yet. The only meaningful entry-point is
 * `upgradeToAndCall(newImpl, data)`, which the registered HCA owner
 * calls (from their EOA, with `msg.sender == owner`) to atomically:
 *   - write `newImpl` into the proxy's ERC-1967 implementation slot,
 *   - optionally `delegatecall` `data` against the new impl (used to
 *     run the new impl's initializer in-proxy).
 *
 * The deployed `HCADeferredImplementation` address is exposed by the
 * factory as `HCAFactory.DEFERRED_IMPLEMENTATION()`. On Sepolia today
 * that's `0x9Af673E422e359323B38e59031509091a8a8BC7A`.
 */
export const HCA_DEFERRED_IMPLEMENTATION_ABI = [
  {
    type: 'constructor',
    inputs: [
      {
        name: 'hcaFactory',
        type: 'address',
        internalType: 'contract IHCAFactoryBasic',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'HCA_FACTORY',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'contract IHCAFactoryBasic',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'upgradeToAndCall',
    inputs: [
      {
        name: 'newImplementation',
        type: 'address',
        internalType: 'address',
      },
      { name: 'data', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'event',
    name: 'AdminChanged',
    inputs: [
      {
        name: 'previousAdmin',
        type: 'address',
        indexed: false,
        internalType: 'address',
      },
      {
        name: 'newAdmin',
        type: 'address',
        indexed: false,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'BeaconUpgraded',
    inputs: [
      {
        name: 'beacon',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Upgraded',
    inputs: [
      {
        name: 'implementation',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'error',
    name: 'HCADeferredImplementationHasNoCode',
    inputs: [
      { name: 'implementation', type: 'address', internalType: 'address' },
    ],
  },
  { type: 'error', name: 'HCADeferredInitializationFailed', inputs: [] },
  { type: 'error', name: 'HCADeferredOwnerNotSet', inputs: [] },
  {
    type: 'error',
    name: 'HCADeferredUpgradeUnauthorized',
    inputs: [
      { name: 'caller', type: 'address', internalType: 'address' },
      { name: 'owner', type: 'address', internalType: 'address' },
    ],
  },
  { type: 'error', name: 'HCAFactoryCannotBeZero', inputs: [] },
] as const
