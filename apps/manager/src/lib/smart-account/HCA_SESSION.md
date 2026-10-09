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
- `setNameWithHCA` / `claimWithHCA` on the reverse-registrar adapters

and only when presented by the fixed `INTENT_EXECUTOR`, within a signed refund
cap, before `validUntil`. A leaked key drives registration-shaped calls; it
cannot move funds arbitrarily.

Lifetime is `DEFAULT_SESSION_VALIDITY_SECONDS` — **24 hours**
(`packages/smart-account/src/providers/rhinestone/manifest.ts`).

## 2. The one signature

`createDestinationSession` builds and signs the session authorization
off-chain. Nothing is written on-chain, ever: the validator deployed on
2026-09-15 (contracts-v2 #426) is **stateless**. It has no
`enableSessionWithRefund`, no per-session storage, and `isPermissionEnabled`
always returns `false`. Every session-signed intent carries the owner's
authorization inline (modes `0x04` / `0x05`), and `_validateSessionEnableProof`
re-checks it each time — the key, `validUntil`, the refund caps, the owner
signature, and that `proof.sessionNonce` equals the account's current
`ownerAndSessionNonce()`. The nonce is also hashed into the salt the
`permissionId` derives from. The record is persisted under `ens-sessions-v9`
(see the storage-key changelog in `session-storage.ts` — the key is bumped
whenever the record shape or a bound address changes).

So the stored record **is** the session. The app re-presents it on later
registrations at no extra prompt, and, symmetrically, anyone holding a copy of
the stored record can too.

### Refund caps

The authorization also fixes three gas-refund caps, hashed into the salt. The
refund-amount and exchange-rate caps are fixed. The gas-overhead cap is sized
when the session is created, from a live orchestrator quote taken just before
the wallet prompt, and stored on the record (`refundCaps`) — the session can
only be rebuilt with the values it was signed with. Records from before this
carry none and rebuild with `LEGACY_REFUND_CAPS`.

The overhead grows as gas gets cheaper, so a session can be outgrown during its
lifetime. The warp transport checks every quote against the session's caps
before signing; when only the overhead is over, the registration machine asks
for a new session sized from that quote (`reauthorizeSession`, one wallet
signature) and resends the leg. See `packages/smart-account/DEBUGGING_INTENTS.md`
§6.

## 3. Revocation

`validUntil` is the only bound that expires on its own. The account's real kill
switch is:

```solidity
event SessionsRevoked(uint96 indexed sessionNonce);
function revokeSessions() external onlyOwner;   // StandaloneSingleOwnerHCA.sol
```

It increments `_sessionNonce` and emits the new value. Every authorization the
owner has signed for the account was signed against an older nonce, so one call
permanently invalidates all of them — in every browser, on every device. The
nonce is per account, per chain: revoking on Sepolia says nothing about another
chain.

Three properties matter when wiring it up:

- **It needs a direct owner EOA transaction, and it costs gas.** `onlyOwner`
  compares `msg.sender` to the factory-certified owner
  (`StandaloneHCAFactory.hcaOwners`). Every HCA-routed path — the IntentExecutor
  intent, a 4337 userOp, `executeByOwner` — makes the inner call with the
  *account* as `msg.sender` and reverts `CallerNotOwner()` (`0x5cd83192`);
  delegatecall is rejected outright. That is deliberate: revocation depends only
  on the owner key, and nothing holding a valid session can undo or front-run
  it. (Verified on Sepolia with `cast call`: ~58k gas from the owner,
  `CallerNotOwner()` from anyone else and through `executeByOwner`.)
- **An undeployed account still has live sessions.** Its authorizations are
  signed against nonce 0 and `StandaloneHCAFactory.deploy` is permissionless, so
  a holder of a copied record can deploy the account and use them.
  `revokeSessions()` needs code to call, so revoking an undeployed account is two
  owner transactions: the factory deployment, then the revoke. The app offers
  that explicitly rather than reporting a false success.
- **Success means the event.** A call to an address with no code also returns
  a successful receipt, so `revokeSessionsOnChain` requires the HCA's own
  `SessionsRevoked` log before it clears anything.

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
| On-chain revocation | `.../revoke-sessions.ts` |
| Addresses per chain | `.../manifest.ts` |
| Failing intents, revert selectors | `packages/smart-account/DEBUGGING_INTENTS.md` |
| Validator policy, enable proof | `contracts-v2/contracts/src/hca/HCAOwnerAndSessionValidator.sol` |
| Account, owner binding, `revokeSessions` | `contracts-v2/contracts/src/hca/StandaloneSingleOwnerHCA.sol` |

Prefer the contracts over this file where they disagree.
