/**
 * HCA session-owner call builders.
 *
 * The ENS HCA prompt-free registration "session" (NOT ERC-7579 SmartSessions)
 * is implemented by adding an EPHEMERAL KEY as an additional, time-boxed OWNER
 * of the HCA's validator (HCAModule, an OwnableValidator), per Rhinestone's
 * guidance. The ephemeral key then signs registration Intents prompt-free as a
 * valid owner, until its expiration.
 *
 * This is NOT a SmartSessions/Emissary scoped session: the SDK rejects
 * `experimental_sessions` for HCA accounts. The HCA's module set is locked
 * (`installModule`/`uninstallModule` revert), but `OwnableValidator.updateConfig`
 * is a state update on the ALREADY-INSTALLED validator (not a module install),
 * so it is allowed.
 *
 * SECURITY (important): an added owner is a FULL HCA owner — it can authorize
 * ANY Intent the HCA can execute (including moving funds), bounded only by its
 * on-chain `uint48` expiration. The ephemeral key lives in localStorage and
 * must be assumed exfiltratable, so we keep its lifetime short (1 week) and
 * support explicit revocation. There is no per-action scoping at this layer
 * (OwnableValidator has none). The ENS name itself is still registered to the
 * EOA (the `register` call's `owner` arg is the EOA), and the EOA remains the
 * permanent primary owner (`owners[0]`, expiration = max) — we only ADD a
 * temporary co-owner.
 *
 * Refs (verified against deployed source):
 *   rhinestonewtf/ens-modules src/hca-module/base/OwnableValidator.sol
 *     - updateConfig(uint256 newThreshold, Owner[] ownersToAdd, address[] ownersToRemove)
 *     - Owner { address addr; uint48 expiration }  (max = permanent)
 *   src/hca-module/HCAModule.sol — only constrains owners[0] permanent at install.
 */

import type { Address, Hex } from 'viem'
import { encodeFunctionData, maxUint48, parseAbi } from 'viem'

/**
 * The HCA validator module (HCAModule / OwnableValidator) on Sepolia.
 * Mirrors the SDK's `ENS_HCA_MODULE`, which isn't re-exported from any public
 * subpath (verified on-chain + against the SDK source).
 */
export const ENS_HCA_MODULE =
  '0x5049ecBd4d961aE6DFEED9b7ccCe7f026454970E' as const

/** Default session lifetime: 1 week. */
export const REGISTRATION_SESSION_VALIDITY_SECONDS = 7 * 24 * 60 * 60

const ownableValidatorAbi = parseAbi([
  'struct Owner { address addr; uint48 expiration; }',
  'function updateConfig(uint256 newThreshold, Owner[] ownersToAdd, address[] ownersToRemove)',
])

/**
 * Build the call that ADDS the ephemeral key as a time-boxed HCA owner.
 *
 * Executed as a self-call from the HCA to its validator (the HCA is
 * `msg.sender`, which `updateConfig` scopes to). Keeps threshold at 1 (1-of-n:
 * either the permanent EOA owner or this ephemeral key can authorize an Intent).
 *
 * @param sessionKeyAddress the ephemeral key to add as a co-owner
 * @param validUntil expiry as a unix timestamp in SECONDS
 */
export function buildAddSessionOwnerCall(params: {
  readonly sessionKeyAddress: Address
  readonly validUntil: number
}): { to: Address; value: bigint; data: Hex } {
  const { sessionKeyAddress, validUntil } = params
  if (BigInt(validUntil) >= maxUint48) {
    // Guard: an added session owner must be time-boxed, never permanent.
    throw new Error('Session owner expiration must be finite (not permanent)')
  }
  // `uint48` is well within JS safe-integer range; viem's parseAbi struct types
  // the field as `number`.
  const expiration = validUntil
  return {
    to: ENS_HCA_MODULE,
    value: 0n,
    data: encodeFunctionData({
      abi: ownableValidatorAbi,
      functionName: 'updateConfig',
      args: [1n, [{ addr: sessionKeyAddress, expiration }], []],
    }),
  }
}
