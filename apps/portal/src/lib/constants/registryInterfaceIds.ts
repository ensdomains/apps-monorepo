/**
 * ERC-165 interface IDs for ENSv2 registry contracts (ensdomains/contracts-v2).
 *
 * `PermissionedRegistry`: `0xafff3a63` = `type(IPermissionedRegistry).interfaceId`.
 *   - Source: contracts-v2 `contracts/src/registry/interfaces/IPermissionedRegistry.sol`
 *     (`/// @dev Interface selector: 0xafff3a63`) and the `supportsInterface`
 *     override in `contracts/src/registry/PermissionedRegistry.sol`.
 *   - Verified on-chain (Sepolia v2): both the root `.eth` registry and
 *     factory-deployed user subregistries return `true` for this ID.
 *   - `UserRegistry` extends `PermissionedRegistry`, so it reports this too.
 *
 * ⚠️ contracts-v2 is pre-release: this ID is an XOR of the interface's function
 * selectors, so it CHANGES if any function on `IPermissionedRegistry` is
 * added/removed/renamed. Re-derive from the contract if detection stops matching.
 */
export const REGISTRY_INTERFACE_IDS = {
  PermissionedRegistry: '0xafff3a63',
} as const

export type RegistryInterfaceName = keyof typeof REGISTRY_INTERFACE_IDS
