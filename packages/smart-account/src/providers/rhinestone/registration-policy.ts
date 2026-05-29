/**
 * Registration-scoped Rhinestone smart-session builder.
 *
 * Produces the `actions` array for a Rhinestone `Session` whose only purpose
 * is to bundle the registration + renewal flows through a bundler. Replaces
 * the previous `[{ policies: [{ type: 'sudo' }] }]` wildcard.
 *
 * Threat-model summary (see `fix-sca-permisssions` design discussion):
 *  - Session key lives in browser localStorage and must be assumed
 *    exfiltratable (XSS, supply chain, extension, etc.).
 *  - Every action below pins (target, selector) and, where relevant,
 *    constrains static-offset args via UniversalActionPolicy so a stolen
 *    session key cannot redirect funds to an attacker or register names to
 *    an attacker. HCA ownership is no longer reachable from the session
 *    at all — see below.
 *  - On-chain time-bound enforcement (a per-action `time-frame` policy
 *    keyed off `validUntil`) is currently DISABLED — see the JSDoc on
 *    `buildRegistrationSessionActions` below for the SDK ↔ deployed
 *    contract initData mismatch that forced this. Until upstream is
 *    fixed, the only expiry check is the client-side staleness window in
 *    `restoreRhinestoneSession` / `isSessionExpired`, which an attacker
 *    can bypass by submitting userOps from their own client. A stolen
 *    key is therefore usable for the full 30-day window from any client.
 *  - Residual surface (accepted "for now"): `ETHRegistrar.renew(...)`
 *    has no on-chain `owner` arg — a stolen key can renew an
 *    attacker-controlled name on the user's USDC/DAI balance, bounded
 *    only by token allowance. Tighten before mainnet via
 *    `SpendingLimitsPolicy` on the USDC/DAI approves (independent of
 *    the time-frame work above).
 *
 * History note — the action set used to include
 * `HCAFactory.setAccountOwner(SCA, EOA)` pinned to (own SCA, own EOA),
 * back when HCA registration was a separate sponsored Rhinestone Intent
 * the SCA submitted to itself. The real `HCAFactory` writes ownership
 * atomically inside `createAccount(initData)` — there is no
 * `setAccountOwner` anymore — and bootstrap is now an EOA-signed,
 * sponsored Intent (see `./bootstrap.ts`). The smart-session no longer
 * needs (or should have) authority over the factory, so the action was
 * dropped. That tightens the stolen-session-key blast radius by one
 * (target, selector) pair.
 *
 * Calldata offset semantics (verified against on-chain
 * UniversalActionPolicy + Biconomy abstractjs `calldataArgument` helper):
 *   `(arg index N) → offset = (N - 1) * 32`, post-selector. Each `ParamRule`
 *   reads exactly 32 bytes; `referenceValue` is left-padded to 32 by the SDK
 *   for hex args.
 */

import {
  ENS_SEPOLIA_CONTRACTS,
  SUPPORTED_TOKENS,
} from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import {
  ethRegistrarCommitSnippet,
  ethRegistrarRegisterSnippet,
  ethRegistrarRenewSnippet,
} from '@ensdomains/ensjs-abi/v2/ethRegistrar'
import { verifiableFactoryDeployProxySnippet } from '@ensdomains/ensjs-abi/v2/verifiableFactory'
import type { Session } from '@rhinestone/sdk'
import type { Address, Hex } from 'viem'
import {
  erc20Abi,
  getAbiItem,
  getAddress,
  keccak256,
  stringToBytes,
  toFunctionSelector,
} from 'viem'

/** Default session lifetime: 30 days. */
export const REGISTRATION_SESSION_VALIDITY_SECONDS = 30 * 24 * 60 * 60

/**
 * Function selectors derived from canonical ABIs at module load.
 *
 * `@ensdomains/ensjs-abi` ships per-function snippets that bundle the
 * function with its associated errors, so we use `getAbiItem` with the
 * function name to pick the function entry. With concrete (literal) abi
 * + name, TypeScript narrows the return type to the matching
 * `AbiFunction` — no `as` cast required.
 *
 * Result: selector typos are compile errors, and any upstream ABI change
 * regenerates the selectors automatically.
 */
const SELECTORS = {
  commit: toFunctionSelector(
    getAbiItem({ abi: ethRegistrarCommitSnippet, name: 'commit' }),
  ),
  register: toFunctionSelector(
    getAbiItem({ abi: ethRegistrarRegisterSnippet, name: 'register' }),
  ),
  renew: toFunctionSelector(
    getAbiItem({ abi: ethRegistrarRenewSnippet, name: 'renew' }),
  ),
  approve: toFunctionSelector(getAbiItem({ abi: erc20Abi, name: 'approve' })),
  deployProxy: toFunctionSelector(
    getAbiItem({
      abi: verifiableFactoryDeployProxySnippet,
      name: 'deployProxy',
    }),
  ),
} as const

export interface BuildRegistrationSessionActionsParams {
  /** EOA owning the smart account. Pinned as `register.owner`. */
  readonly eoaAddress: Address
  /**
   * Session expiry as a unix timestamp in **seconds**.
   *
   * Currently threaded through `RhinestoneStoredSession.validUntil` and
   * consumed only by the client-side staleness check
   * (`restoreRhinestoneSession` / `isSessionExpired`) — see the function-
   * level JSDoc for why the matching on-chain `time-frame` policy is
   * disabled. Kept in this params type so the API doesn't churn when
   * upstream is fixed and the policy is re-enabled.
   */
  readonly validUntil: number
}

/**
 * Build the Rhinestone session actions for the registration/renewal scope.
 *
 * Returns a non-empty array of `ScopedAction`s. Plug into a `Session` along
 * with `owners` and `chain` at the call site.
 *
 * `validUntil` (unix seconds) is **accepted but not currently attached as
 * an on-chain `time-frame` policy** due to a Rhinestone SDK ↔ deployed
 * contract mismatch:
 *
 *   - SDK 1.5.1 encodes `TimeFramePolicy` initData as
 *     `encodePacked(['uint48','uint48'], [validUntil, validAfter])` →
 *     12 bytes.
 *   - The TimeFramePolicy contract deployed on Sepolia at
 *     `0x8177451511de0577b911c254e9551d981c26dc72` reads
 *     `uint48(uint128(bytes16(initData[0:16])))` and
 *     `uint48(uint128(bytes16(initData[16:32])))` → 32 bytes.
 *
 * Initialization reverts at the calldata-bounds check on the second
 * `bytes16(initData[16:32])` slice, surfacing as a generic
 * "Bundle simulation failed" 400 from the orchestrator with no inner
 * revert reason. Confirmed against the verified source on Sourcify
 * (rhinestonewtf/smartsessions fork — struct-based config instead of
 * the upstream erc7579/smartsessions packed `type ... is uint256`).
 *
 * Until Rhinestone publishes an SDK release whose `'time-frame'` policy
 * encoder matches the deployed contracts, on-chain expiry enforcement is
 * not available. The dApp falls back to client-side `validUntil`
 * checking only (`restoreRhinestoneSession` / `isSessionExpired`), which
 * is a UX preflight, not a security boundary — a stolen session key
 * remains usable for the full 30-day window from any client until the
 * SDK is fixed and we re-enable the policy here.
 *
 * Tracking: file follow-up against `rhinestonewtf/sdk` reproducing the
 * initData mismatch with a 32-byte `encodePacked(['uint128','uint128'])`
 * encoding as the suggested fix.
 *
 * @param params.validUntil Required at the API level to keep the
 *   signature stable when on-chain enforcement is re-enabled; threaded
 *   through `RhinestoneStoredSession.validUntil` and used only by the
 *   client-side staleness check today.
 */
export function buildRegistrationSessionActions(
  params: BuildRegistrationSessionActionsParams,
): NonNullable<Session['actions']> {
  // `validUntil` is accepted but intentionally unused on-chain today —
  // see the JSDoc above for the SDK↔contract mismatch that forced this.
  // Pulled into a void to keep linters happy without changing the API
  // shape that the actor + signer construction both rely on.
  void params.validUntil
  // Normalize to EIP-55 checksum so `referenceValue` is byte-identical
  // regardless of input casing. Without this, a session signed against
  // a checksummed EOA but rebuilt at signer-construction time against
  // a lowercase EOA (or vice versa) produces a different `PermissionId`
  // and the on-chain smart-sessions validator returns
  // `InvalidSignature()` — surfacing as the orchestrator's opaque
  // "Bundle simulation failed" 400. Sources of case drift we've seen
  // in the wild: wagmi normalizes some chains to lowercase, viem
  // returns EIP-55 in `walletClient.account.address`, JSON
  // round-trips preserve whatever was written, and Para wraps the
  // address through its own helper. Normalizing here fixes all of
  // them in one place.
  const eoaAddress = getAddress(params.eoaAddress)

  const ETHRegistrar = ENS_SEPOLIA_CONTRACTS.ETHRegistrar
  const VerifiableFactory = ENS_SEPOLIA_CONTRACTS.VerifiableFactory
  const PermissionedResolverImpl = ENS_SEPOLIA_CONTRACTS.DedicatedResolverImpl
  const USDC = SUPPORTED_TOKENS.USDC
  const DAI = SUPPORTED_TOKENS.DAI

  return [
    // 1. ETHRegistrar.commit(bytes32) — opaque hash, fully gated by
    //    (target, selector). No rules required; including a
    //    UniversalActionPolicy with zero rules is rejected by the SDK
    //    (rules must be a non-empty tuple), so we use SudoPolicy here. The
    //    (target, selector) match is the actual security boundary.
    {
      target: ETHRegistrar,
      selector: SELECTORS.commit,
      policies: [{ type: 'sudo' as const }],
    },

    // 2. ETHRegistrar.register(string,address,bytes32,address,address,uint64,address,bytes32)
    //    Pin owner == EOA. The dApp must pass `owner = eoaAddress`
    //    (see registrationUi.machine.ts). Registering directly to the EOA
    //    means the on-chain ENS owner is the human, so:
    //      - "My names" indexer lookups by EOA work without HCA-equivalence,
    //      - Registry-level checks (transfer / setResolver / wrap) accept
    //        either a direct EOA call OR an SCA call unwrapped through
    //        HCAEquivalence to the same EOA.
    //    Subsequent record edits on the dedicated resolver continue to work
    //    because the EACL grantee is also the EOA (see deployingResolver
    //    in registration.machine.ts).
    {
      target: ETHRegistrar,
      selector: SELECTORS.register,
      policies: [
        {
          type: 'universal-action' as const,
          rules: [
            {
              condition: 'equal' as const,
              calldataOffset: 32n, // arg #2 (owner)
              referenceValue: eoaAddress,
            },
          ],
        },
      ],
    },

    // 3. ETHRegistrar.renew(string,uint64,address,bytes32)
    //    No constrainable owner arg; transitively gated by the
    //    approve allowlist (only USDC/DAI can build allowance against
    //    ETHRegistrar). Residual exfiltration via attacker-name renewal
    //    is the accepted-for-now hole.
    {
      target: ETHRegistrar,
      selector: SELECTORS.renew,
      policies: [{ type: 'sudo' as const }],
    },

    // 4. USDC.approve(address spender, uint256 amount) — pin spender.
    {
      target: USDC,
      selector: SELECTORS.approve,
      policies: [
        {
          type: 'universal-action' as const,
          rules: [
            {
              condition: 'equal' as const,
              calldataOffset: 0n, // arg #1 (spender)
              referenceValue: ETHRegistrar,
            },
          ],
        },
      ],
    },

    // 5. DAI.approve(address spender, uint256 amount) — pin spender.
    {
      target: DAI,
      selector: SELECTORS.approve,
      policies: [
        {
          type: 'universal-action' as const,
          rules: [
            {
              condition: 'equal' as const,
              calldataOffset: 0n, // arg #1 (spender)
              referenceValue: ETHRegistrar,
            },
          ],
        },
      ],
    },

    // 6. VerifiableFactory.deployProxy(address impl, uint256 salt, bytes initData)
    //    Pin implementation. `init.owner` lives inside the dynamic `bytes`
    //    arg and cannot be constrained with stock UAP — but a malicious
    //    init.owner only matters if the resulting proxy is set as a name's
    //    resolver, which is recoverable by the EOA via
    //    `registry.setResolver` from the connected wallet (HCAEquivalence).
    {
      target: VerifiableFactory,
      selector: SELECTORS.deployProxy,
      policies: [
        {
          type: 'universal-action' as const,
          rules: [
            {
              condition: 'equal' as const,
              calldataOffset: 0n, // arg #1 (implementation)
              referenceValue: PermissionedResolverImpl,
            },
          ],
        },
      ],
    },

    // The legacy 7th action — `HCAFactory.setAccountOwner(SCA, EOA)` —
    // is intentionally absent. See the file header for why: bootstrap
    // is wallet-driven now, the session never touches the factory.
  ]
}

/**
 * Deterministic keccak256 over the action set produced by
 * `buildRegistrationSessionActions(params)`.
 *
 * Used to detect drift between session-create time (where the actions
 * are signed into a `PermissionId` via `experimental_signEnableSession`)
 * and signer-construction time (where the actions are rebuilt for the
 * SDK's session-mode signer config). Any divergence breaks the
 * `PermissionId` and yields `InvalidSignature()` at orchestrator
 * simulation time — the worst kind of silent failure, since the user
 * sees a generic "transaction failed" without any indication the
 * stored session is the cause.
 *
 * Persist the hash on the stored session at create time; recompute it
 * with the same `params` at load time and refuse to restore on
 * mismatch. The user pays one fresh wallet prompt; the alternative is
 * an opaque failure deep inside a registration tx.
 *
 * Serialization shape: the standard `JSON.stringify` doesn't handle
 * the `bigint` values in `calldataOffset`, so we normalize via a
 * replacer. The serialization is **not** intended to be canonical
 * across versions — when the action set changes shape (added rules,
 * new policy type, etc.) the hash naturally changes, which is exactly
 * the signal we want.
 */
export function buildRegistrationSessionActionsHash(
  params: BuildRegistrationSessionActionsParams,
): Hex {
  const actions = buildRegistrationSessionActions(params)
  const serialized = JSON.stringify(actions, (_key, value) =>
    typeof value === 'bigint' ? `${value.toString()}n` : value,
  )
  return keccak256(stringToBytes(serialized))
}
