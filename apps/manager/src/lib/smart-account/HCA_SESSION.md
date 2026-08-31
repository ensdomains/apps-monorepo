# HCA Scoped Sessions

How the ENS Manager app makes standalone-HCA registration flows run
**prompt-free after a single signature**.

> ⚠️ **This document was rewritten.** Every prior revision described the
> Rhinestone-hosted HCA (`HCAModule` / `OwnableValidator`), where a "session"
> was an ephemeral key added as a **time-boxed co-owner** via `updateConfig`.
> That design is gone. It is worth knowing it existed, because the stale doc is
> what security review read when it filed WEB-674 against code that no longer
> exists.

---

## 1. What a session is now

A session is a real **ERC-7579 SmartSession** on
`HCAOwnerAndSessionValidator` (`contracts-v2/contracts/src/hca/`). The account
is `StandaloneSingleOwnerHCA` — a proxy deployed by `StandaloneHCAFactory`
through `VerifiableFactory` (CREATE3), permanently bound to one owner EOA. The
HCA address and the owner address are always distinct; the owner is an input to
the address derivation (`computeStandaloneHcaAddress`).

The ephemeral session key is **not an owner**. It can only produce the call
shapes the validator hardcodes:

- `ETHRegistrar.commit` / `register`
- ERC-20 `approve` / EIP-2612 `permit` / `transferFrom` on the payment tokens
- `VerifiableFactory.deployProxy` for the account's `PermissionedResolver`
- the resolver setters and `authorizeNameRoles`
- `setNameWithHCA` on the default-reverse adapter

and only when presented by the fixed `INTENT_EXECUTOR`, within a signed refund
cap, before `validUntil`. A leaked key drives registration-shaped calls; it
cannot move funds arbitrarily.

Lifetime is `DEFAULT_SESSION_VALIDITY_SECONDS` — **24 hours**
(`packages/smart-account/src/providers/rhinestone/manifest.ts`).

## 2. The one signature

`createDestinationSession` builds and signs the session authorization
off-chain. There is no separate ENABLE transaction: the proof rides along with
the first action's intent, and `_validateSessionEnableProof` enables the session
as a side effect of validating it. The record is persisted under
`ens-sessions-v9` (see the storage-key changelog in `session-storage.ts` — the
key is bumped whenever the record shape or a bound address changes).

The proof is **reusable**. It is validated purely from its own fields, the owner
signature, and the account's current session nonce — the on-chain session slot
is never read. So the app can re-present it on later registrations at no extra
prompt, and, symmetrically, anyone holding a copy of the stored record can too.

## 3. Revocation

`validUntil` is the only bound that expires on its own. The account's real kill
switch is:

```solidity
function revokeSessions() external onlyOwner;   // StandaloneSingleOwnerHCA.sol
```

It increments `_sessionNonce`, which the validator checks on every path *and*
mixes into the session salt that derives the `permissionId`. One call
permanently invalidates every session and every outstanding enable proof for
that account.

Two properties matter when wiring it up:

- **It needs a direct owner EOA transaction, and it costs gas.** `onlyOwner`
  compares `msg.sender` to the stored owner. Every HCA-routed path — the
  IntentExecutor intent, a 4337 userOp, `executeByOwner` — makes the inner call
  with the *account* as `msg.sender`, and delegatecall is rejected outright
  (`_isAllowedUserOpCallData`, `_requireNonDelegateCall`). That is deliberate:
  revocation depends only on the owner key, and nothing holding a valid intent
  signature can undo or front-run it.
- **Overwriting the session slot is not a substitute.** An owner-signed intent
  can reach `enableSessionWithRefund` gaslessly, but `_enableSessionFor` refuses
  a zero session key or a past `validUntil`, and the reusable enable proof would
  just rewrite the slot back. Only the nonce bump kills the proof.

Clearing `localStorage` (`removeSession`, `removeSessionsByOwner`,
`clearAllSessions`) forgets our copy. It is not revocation.

## 4. Reuse & hydration

`SmartAccountContext` hydrates `activeSession` whenever the owner or the HCA
address changes, keyed on **both** (`sessionHydrationKey` in `sessionGate.ts`) —
on reload the owner resolves a render before the HCA address does, and an
owner-only guard would latch `hasActiveSession = false` forever. Covered by
`sessionGate.test.ts`.

Sessions survive disconnect on purpose: `WalletLifecycle` preserves the
`ens-session*` keys so a reconnect costs zero prompts. An actual owner switch
evicts them (`removeSessionsByOwner` via `onOwnerCleared`). Disconnect is
therefore not a logout, which is precisely why an explicit revoke matters.

## 5. Where to look

| Concern | Source |
|---------|--------|
| Session build / salt / permission ID | `packages/smart-account/src/providers/rhinestone/session.ts` |
| Persistence + storage-key changelog | `.../session-storage.ts` |
| Account init, deploy readiness | `.../initialize-account.ts` |
| Addresses per chain | `.../manifest.ts` |
| Failing intents, revert selectors | `packages/smart-account/DEBUGGING_INTENTS.md` |
| Validator policy, enable proof | `contracts-v2/contracts/src/hca/HCAOwnerAndSessionValidator.sol` |
| Account, owner binding, `revokeSessions` | `contracts-v2/contracts/src/hca/StandaloneSingleOwnerHCA.sol` |

Prefer the contracts over this file where they disagree.
