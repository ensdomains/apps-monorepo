# Standalone-HCA Registration Sessions

The Manager's standalone-HCA USDC registration route uses a scoped session on
`HCAOwnerAndSessionValidator`. The connected wallet signs one session
authorization, and the ephemeral session key signs the HCA registration
intents without additional wallet prompts. DAI keeps the inherited canonical
registrar route and uses the connected EOA instead.

For contract-level failure analysis, validator policy details, and reproducible
traces, see
[`packages/smart-account/DEBUGGING_INTENTS.md`](../../../../../packages/smart-account/DEBUGGING_INTENTS.md).

## Session model

- The session is a scoped ERC-7579 SmartSession, not the retired
  `updateConfig` ephemeral-owner design.
- The permission is bound to one HCA, its derived `PermissionedResolver`, the
  registration calls allowed by `HCAOwnerAndSessionValidator`, the refund
  token, refund caps, and an expiry.
- The wallet signs the authorization before registration begins. This does not
  submit a standalone enable transaction.
- The first HCA action carries the authorization through
  `enableSessionWithRefund(...)`; later actions use the enabled session.
- The current implementation builds only the destination-chain session. The
  source-chain salt helper exists for a future cross-chain funding route.

The session lasts 24 hours by default. A registration may start only when at
least 10 minutes remain, because commit and reveal are separate session-signed
legs with a commitment cooldown between them. On-chain validation remains the
authoritative expiry boundary.

## Payment routes

### USDC

USDC registration uses the standalone registrar and the session-backed HCA
route. The displayed amount is reconciled with the amount the wallet must fund:

```text
budget = registration price + commit network cost + reveal network cost
wallet debit = max(budget - existing HCA USDC balance, 0)
```

The pricing screen shows the wallet's USDC balance and estimated network fee on
the USDC payment method. It refreshes the same displayed budget when Register
is clicked, then compares the raw wallet balance with the raw wallet debit.
Existing USDC in the user's HCA is account credit and reduces the permit amount.

The funding pair is an EIP-2612 `permit` plus `transferFrom`. Whenever that pair
is present, the commit batch also carries the reusable session-enable proof.
This is required even if the session was enabled by an earlier registration;
the validator routes the funding pair through the proof-bearing policy path.

### DAI

DAI remains selectable but does not use the HCA budget, HCA session gate, or
standalone registrar. It uses the canonical pricing and registration route with
the connected EOA as its signer. The shared registration machine rejects a DAI
start from a Rhinestone signer unless an EOA approval signer is supplied.

## Manager flow

`TokenPickerContent.tsx` applies the session gate only when Register is clicked
for USDC. The clicked token and its quote are captured as one immutable attempt,
so changing the selection while availability or funding checks are running
cannot switch the route. Concurrent Register attempts are ignored until the
active attempt settles.

```text
Register with USDC
  -> require a stored session with 10 minutes of headroom
     -> missing or expiring: open EnableSessionModal
        -> wallet signs the scoped authorization
        -> publish the session-attached signer
  -> refresh the displayed HCA budget
  -> compare raw wallet balance with account-credit-adjusted debit
  -> confirm availability
  -> start the session-backed registration

Register with DAI
  -> skip the session gate and HCA budget
  -> confirm availability
  -> start the inherited EOA registration
```

The deferred USDC action resumes only after React publishes the new
session-attached signer. It retains the token and quote from the original click.

## Persistence and recovery

Sessions are stored under `ens-sessions-v9` and keyed by HCA address. The stored
record includes the ephemeral private key, permission ID, authorization,
per-chain digests, resolver, HCA session nonce, expiry, owner, and chain. Storage
versions are bumped whenever that serialized shape or its bound deployment
changes.

Hydration verifies HCA address, owner address, chain, and expiry before reuse.
The hydration dedupe key includes both owner and HCA address because the wallet
owner can resolve before the derived account during page load. A mismatch or an
expired record is evicted; a session without enough registration headroom is
replaced when the next registration starts.

The enable-data can be rebuilt from the stored authorization without another
wallet prompt. It is safe to attach on every qualifying commit because the
proof is reusable while valid and `enableSessionWithRefund(...)` is idempotent.

## Code map

| Location | Responsibility |
|---|---|
| `packages/smart-account/src/providers/rhinestone/session.ts` | Builds and signs the scoped destination session and reconstructs it from persisted fields. |
| `packages/smart-account/src/providers/rhinestone/manifest.ts` | Owns chain-specific contracts, session validity, permissions, and refund caps. |
| `packages/smart-account/src/providers/rhinestone/session-storage.ts` | Persists, scopes, expires, and checks registration headroom for sessions. |
| `packages/smart-account/src/providers/rhinestone/types.ts` | Defines the persisted record and rebuilds the registration machine's enable payload. |
| `apps/manager/src/lib/smart-account/actors/session.actors.ts` | Reuses or authorizes a session and stores it. |
| `apps/manager/src/lib/smart-account/actors/build-session-signer.ts` | Reconstructs the SDK session attached to the Rhinestone signer. |
| `apps/manager/src/lib/smart-account/SmartAccountContext.tsx` | Hydrates the active session, exposes authorization state, and supplies enable-data. |
| `apps/manager/src/lib/smart-account/sessionGate.ts` | Decides whether a Rhinestone registration needs a new authorization. |
| `apps/manager/src/features/wallet/hooks/useSmartSessionGate.tsx` | Defers a USDC start until authorization is published. |
| `apps/manager/src/features/register-v2/workflow/pricing/components/TokenPickerContent.tsx` | Owns payment selection, the displayed funding quote, click-time refresh, and route start. |
| `packages/transaction-manager/src/machines/registration/registration.machine.ts` | Enforces the USDC HCA route and the DAI EOA route at the shared start boundary. |

## Verification checklist

- A first USDC registration requests one scoped-session authorization; it also
  requests a USDC permit when the wallet must top up the HCA. Commit and reveal
  are session-signed.
- A later USDC registration reuses a stored session only when it has at least
  10 minutes of remaining lifetime.
- The USDC row's displayed fee, account credit, wallet debit, funding check, and
  permit amount derive from the same HCA budget.
- A funding permit is paired with the session-enable proof on every qualifying
  commit.
- DAI bypasses the HCA session and budget and uses the connected EOA with the
  canonical registrar.
