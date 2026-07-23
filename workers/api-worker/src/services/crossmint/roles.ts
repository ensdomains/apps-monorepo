import type { Address, Hex } from 'viem'
import { parseAbi, stringToHex } from 'viem'

/**
 * Zodiac Roles v2 hardening for the Crossmint fulfilment wallet.
 *
 * Problem: the server wallet key (`ETH_PRIVATE_KEY`) is a raw EOA secret in the
 * worker env. An EOA key can never be revoked — once leaked, whatever it holds
 * (the USDC/DAI float, its registrar approvals, names in flight) is gone.
 *
 * Fix: move all funds and on-chain authority to a treasury **Safe** and demote
 * the worker key to a **role member** on a Zodiac Roles v2 modifier attached to
 * that Safe. Every write goes through `Roles.execTransactionWithRole`, so the
 * Safe (not the EOA) is `msg.sender` at the target and therefore the payer the
 * registrar charges. The role only permits the exact fulfilment surface —
 * commit / register (owner pinned to the Safe, duration capped, payment token
 * allowlisted) / approve (spender pinned to the registrar, amount capped) /
 * registry safeTransferFrom (from pinned to the Safe) / resolver deployProxy /
 * voucher burn — so a leaked worker key can at worst burn the Safe's standing
 * registrar allowance on junk registrations that land IN the Safe (recoverable).
 * Revocation is a single `revokeRole` tx by the Safe.
 *
 * Setup: `scripts/setup-zodiac-roles.ts` generates the Safe Transaction Builder
 * batch that scopes the role. See `docs/zodiac-roles.md` for the full runbook.
 *
 * When `REGISTRAR_SAFE_ADDRESS` / `REGISTRAR_ROLES_MODULE_ADDRESS` are unset
 * the worker falls back to legacy direct-EOA mode (local dev, standalone
 * scripts), where the EOA itself funds registrations.
 */

/** The single Roles v2 entrypoint the worker calls; everything else is admin-side. */
export const ROLES_MODULE_ABI = parseAbi([
  'function execTransactionWithRole(address to, uint256 value, bytes data, uint8 operation, bytes32 roleKey, bool shouldRevert) returns (bool success)',
])

/**
 * Default role key, ascii right-padded to bytes32. Must match the key the
 * setup script scoped on the modifier (overridable via env for staging/PR
 * copies sharing one Safe with several roles).
 */
export const REGISTRAR_ROLE_KEY: Hex = stringToHex('ens-crossmint-registrar', {
  size: 32,
})

export interface RolesConfig {
  /** Treasury Safe holding the payment-token float; the payer at the registrar. */
  safe: Address
  /** Zodiac Roles v2 modifier enabled on the Safe. */
  module: Address
  /** bytes32 role key the worker EOA is a member of. */
  roleKey: Hex
}

/**
 * Read the Roles config from the environment.
 *
 * Fails CLOSED: with both Role vars absent, direct-EOA mode (writes signed
 * straight from `ETH_PRIVATE_KEY`, no Safe/role scoping) is only permitted when
 * `ALLOW_DIRECT_EOA_SIGNER` is explicitly set — the local-dev / standalone-script
 * escape hatch. A real worker deployment that loses or clears the Role vars then
 * throws instead of silently degrading to an unrevocable, unscoped hot key.
 * Partial config (one var set) always throws.
 */
export function getRolesConfig(
  env: CloudflareBindings,
): RolesConfig | undefined {
  const safe = env.REGISTRAR_SAFE_ADDRESS
  const module = env.REGISTRAR_ROLES_MODULE_ADDRESS
  if (!safe && !module) {
    if (env.ALLOW_DIRECT_EOA_SIGNER) return undefined
    throw new Error(
      'Refusing to sign from a raw EOA: set REGISTRAR_SAFE_ADDRESS + ' +
        'REGISTRAR_ROLES_MODULE_ADDRESS for Roles mode, or ALLOW_DIRECT_EOA_SIGNER ' +
        '=1 to opt into direct-EOA mode (local/dev only).',
    )
  }
  if (!safe || !module) {
    throw new Error(
      'REGISTRAR_SAFE_ADDRESS and REGISTRAR_ROLES_MODULE_ADDRESS must be set together',
    )
  }
  return {
    safe: safe as Address,
    module: module as Address,
    roleKey:
      (env.REGISTRAR_ROLES_ROLE_KEY as Hex | undefined) ?? REGISTRAR_ROLE_KEY,
  }
}
