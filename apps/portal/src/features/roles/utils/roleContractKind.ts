import { match } from 'ts-pattern'
import type { Hex } from 'viem'

/**
 * Which role model an address speaks. Registries and PermissionedResolvers both
 * inherit `EnhancedAccessControl`, so the same `grantRoles` / `grantRootRoles`
 * call succeeds on either, but the bits mean different things: bit 0 is
 * `ROLE_REGISTRAR` on a registry and `ROLE_SET_ADDRESS` on a resolver. A role
 * editor must know which one it is writing to before it encodes a bitmap.
 */
export type RoleContractKind =
  | 'registry'
  | 'permissioned-resolver'
  | 'unsupported'

/**
 * ERC-165 id of `IPermissionedRegistry` (contracts-v2 @ 71a3b733, the 2026-09-15
 * Sepolia deployment): the XOR of the selectors that interface declares.
 * `PermissionedRegistry` and everything built on it (the root and .eth
 * registries, `UserRegistry`, `WrapperRegistry`) report it; `PermissionedResolver`
 * does not.
 */
export const PERMISSIONED_REGISTRY_INTERFACE_ID: Hex = '0xc18bd555'

/**
 * Both checks must agree. An address that claims both models, or neither, gets
 * no role editor.
 */
export const classifyRoleContract = ({
  isPermissionedResolver,
  isPermissionedRegistry,
}: {
  readonly isPermissionedResolver: boolean
  readonly isPermissionedRegistry: boolean
}): RoleContractKind =>
  match({ isPermissionedResolver, isPermissionedRegistry })
    .returnType<RoleContractKind>()
    .with(
      { isPermissionedResolver: true, isPermissionedRegistry: false },
      () => 'permissioned-resolver',
    )
    .with(
      { isPermissionedResolver: false, isPermissionedRegistry: true },
      () => 'registry',
    )
    .otherwise(() => 'unsupported')
