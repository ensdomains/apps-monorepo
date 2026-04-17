# Manager Migration: Unsponsored HCA Flow

**Date:** 2026-04-17
**Status:** Draft
**Scope:** `apps/manager/` migration flow only

## Problem

Today the manager-app name migration submits batched UserOps through a ZeroDev Kernel smart account with a Pimlico paymaster attached. Gas is fully sponsored — the user's connected wallet never sees a gas prompt. We want to keep the HCA architecture (Kernel smart account executing batched calls, HCAEquivalence contracts seeing the EOA as `_msgSender()`) but drop the paymaster, so the user's EOA signs the UserOp and the smart account pays gas in ETH from its own balance.

## Goal

For the manager-app migration flow — and only that flow — UserOps are submitted through an unsponsored Kernel client. Other flows (renewal, registration, primary-name, resolver) keep using the sponsored client.

## Scope

**In scope**
- `apps/manager/src/lib/smart-account/` — add an unsponsored Kernel client alongside the sponsored one
- `apps/manager/src/features/migration/` — use the unsponsored signer; add a pre-flight SA balance check
- Both wallet types in the manager app (external via `zerodev/kernel.ts`, Para-embedded via `pimlico.ts`)

**Out of scope**
- Renewal, registration, primary-name, resolver flows — keep sponsorship
- `packages/transaction-manager/` — no changes; the zerodev transport already reads `paymaster` from the client it's handed
- EOA→SA funding UI — first pass shows a clear error only; a funding prompt is future work

## Invariants preserved

- EOA remains the owner of all ENS names (HCAFactory registration unchanged)
- Approval txs (`setApprovalForAll` on BaseRegistrar/NameWrapper) stay on the EOA via `writeContract` — already the case in `approveSCAIfNeeded`
- Batching, step tracking, XState machine structure — unchanged
- `HCAEquivalence` keeps working because contracts resolve `_msgSender()` from the SA address regardless of who pays gas

## Architecture

### Why a second Kernel client

viem's `prepareUserOperation` resolves the paymaster as `parameters.paymaster ?? bundlerClient.paymaster`. With `??` there is no way to pass `undefined` at call time to disable a paymaster set on the client. The cleanest workaround is to construct a second Kernel client that shares the same `kernelAccount` + ECDSA validator + bundler transport but omits the `paymaster` option.

### Two signers on the context

`SmartAccountContext` already exposes one `signer: Signer` (zerodev, sponsored). We add a parallel `unsponsoredSigner: Signer | null` built from the same account + a second client. Both signers have `type: 'zerodev'` and are routed through the same transport actor — the transport doesn't need to know the difference.

### Pre-flight balance check

Before the first batch UserOp, `executeMigration` checks the SA's ETH balance against a conservative hardcoded threshold and throws `MigrationInsufficientGasError` if underfunded, so the user gets an actionable failure instead of an opaque bundler error. The approval phase is unaffected (still EOA-paid), so the check only gates the sponsored-batch phase.

## Files to change

### `apps/manager/src/lib/smart-account/zerodev/kernel.ts`
- Extract client construction into a helper that accepts `{ paymaster?: boolean }`
- `initializeZeroDevAccount` returns both `client` (with `paymaster: pimlicoClient`) and `unsponsoredClient` (no `paymaster` field) built from the same `kernelAccount` and `ecdsaValidator`
- Update `ZeroDevInitResult` interface to include `unsponsoredClient: KernelAccountClient`

### `apps/manager/src/lib/smart-account/pimlico.ts`
- Mirror the same pattern: return both sponsored and unsponsored `SmartAccountClient` instances from the single init function

### `apps/manager/src/lib/smart-account/SmartAccountContext.tsx`
- Store `unsponsoredClient` in the ZeroDev account state
- Add `unsponsoredSigner: Signer | null` built the same way as `signer` but wrapping the unsponsored client
- Expose it on the context value returned by `useSmartAccountContext()`
- Keep `isSessionClient` tracking on the sponsored client only; sessions are out of scope for migration and adding session support to the unsponsored path isn't needed

### `apps/manager/src/features/migration/pages/MigrationPage.tsx`
- In `handleBeginUpgrade`, read `unsponsoredSigner` instead of `signer`
- Guard early-return check updated to use the unsponsored variant

### `apps/manager/src/features/migration/service/migrationService.ts`
- Add `MigrationInsufficientGasError` (via `TaggedError`) with fields `{ saAddress: Address; balance: bigint; required: bigint }`
- Add `checkSmartAccountHasGas(ctx, estimatedCostWei)` helper — calls `publicClient.getBalance({ address: accountAddress })` and throws `MigrationInsufficientGasError` if below threshold
- Call `checkSmartAccountHasGas` once, after approvals are done, before entering the batch loop
- Hardcode the threshold at `parseEther('0.005')` for v1 (documented comment; revisit after real gas measurements on Sepolia/Namechain)
- Remove `sponsored: true` from both `zerodev` and `rhinestone-intent` branches of `buildSCARequest` (no longer load-bearing now that the client itself is unsponsored; rhinestone branch is unused in the manager app but we keep the code consistent)

### `apps/manager/src/features/migration/state/migrationUi.machine.ts`
- Change `MigrationError` from `{ type: 'generic'; message: string }` to the discriminated union:
  ```ts
  type MigrationError =
    | { type: 'generic'; message: string }
    | { type: 'insufficient-gas'; saAddress: Address; balance: bigint; required: bigint }
  ```
- Replace the current `extractErrorMessage` with a `toMigrationError(err: unknown): MigrationError` helper that:
  - Returns the `'insufficient-gas'` variant when `err instanceof MigrationInsufficientGasError` (pull fields from the tagged error payload)
  - Falls back to `'generic'` with the current message-extraction logic otherwise
- The `.catch` handler in the `runMigration` actor uses `toMigrationError(err)` in the `sendBack({ type: 'migration.failed', error: … })` call

### Migration failure UI — `apps/manager/src/features/migration/pages/MigrationPage.tsx`
- `formatMigrationError(error)` currently returns `error.message`. Update it to discriminate on `error.type`:
  - `'generic'` → `error.message` (unchanged)
  - `'insufficient-gas'` → a structured block (multi-line) showing SA address (truncated, selectable), current balance and required minimum (both formatted as ETH via `formatEther`), and the guidance "Send at least X ETH to this address, then retry."
- Keep the existing `<motion.div>` container and font styling; the only change is what `formatMigrationError` returns and allowing it to return JSX instead of a plain string (rename helper if useful, or inline a small renderer component)
- The existing retry button on the `failure` state stays — it re-enters `migrate`, which re-runs the balance check before attempting any batch

## Data flow

```
User clicks "Upgrade names"
    └─> MigrationPage.handleBeginUpgrade
        └─> reads unsponsoredSigner from context
        └─> sends migration.start event to uiMachine
            └─> invokes runMigration actor
                └─> executeMigration
                    ├─ approveSCAIfNeeded  (EOA pays, as before)
                    ├─ checkSmartAccountHasGas  (NEW — throws if underfunded)
                    └─ for each batch:
                         submitBatchedUserOp
                           └─> transactionManager.startTransaction(request, unsponsoredSigner)
                               └─> zerodev-transport actor
                                   └─> unsponsoredClient.sendUserOperation({ calls })
                                       └─> EOA signs UserOp
                                       └─> bundler submits; SA pays gas from its ETH
```

## Error handling

- **SA underfunded before batch 1**: `MigrationInsufficientGasError` → failure view with actionable message + retry
- **SA runs out mid-flight (batch N fails)**: existing `MigrationError` path handles it; the partial-success flow (`txHashes` already recorded, remaining names re-queued on retry) still works because `resetForRetry` filters out already-migrated names
- **User rejects UserOp signature**: existing `MigrationUserRejectedError` path unchanged
- **Approval phase failures**: unchanged — approvals never touched the SA's gas

## Testing

**Unit**
- `SmartAccountContext.test.tsx` — `unsponsoredSigner` is non-null when the context is initialized, and its wrapped client has no `paymaster`
- New `migrationService.test.ts` covering:
  - `checkSmartAccountHasGas` with balance above / at / below threshold
  - `executeMigration` short-circuits with `MigrationInsufficientGasError` when the SA is underfunded, before any batch is attempted
  - `executeMigration` proceeds normally when SA has sufficient balance

**Manual**
- Fund a fresh SA to just under threshold on Sepolia → migration fails with the new error UI
- Fund the SA above threshold → migration runs end-to-end; verify wallet shows a sign prompt per batch (not silent) and that the SA's ETH balance drops after each batch
- Approve phase still prompts the EOA for `setApprovalForAll` as before

## Open questions / future work

- **Threshold tuning**: 0.005 ETH is a conservative guess for up to 50 names per batch. Should be measured on real batches once we have Sepolia gas numbers.
- **Funding UI**: this spec only surfaces an error. A follow-up can add an EOA→SA transfer button inline in the failure view.
- **Session support on unsponsored path**: out of scope; sessions are a sponsored-flow convenience and re-implementing them without a paymaster isn't useful.
