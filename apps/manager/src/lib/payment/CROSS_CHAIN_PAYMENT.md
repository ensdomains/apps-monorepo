# Cross-chain stable payment (L2 → L1) — design

Status: **phase-2 intent corrected; cross-chain funding path not yet built.**
This explains why the first cut of #851 returned `NO_PLAN_AVAILABLE`, what the
real constraint is, and the options to finish it.

## What we want

Pay ENS v2 registration rent with an L2 stable (e.g. Base Sepolia USDC) the user
holds in their **EOA**, instead of holding the L1 stable. The name is owned by
the EOA; the **HCA** (Hidden Contract Account) is the gas/execution vehicle.

## The recipient is NOT the blocker — the source funder is

A Warp intent (`@rhinestone/sdk` 1.7, see `src/execution/utils.ts`) has two
distinct fields:

```
metaIntent = {
  account,            // whose funds are SPENT on the source side
  recipient,          // where bridged funds LAND on the destination side
  accountAccessList,  // chains + tokens only — NO owner
  destinationExecutions,
}
```

- `recipient` can be any address (`getRecipient` accepts a plain address as an
  EOA). So delivering bridged funds to the EOA — or the HCA — is supported and
  is a first-class field.
- `account` is the **single** intent account (the HCA). It is whose balance the
  orchestrator spends on the source side. **There is no separate funder field**,
  and `accountAccessList` only narrows which chains/tokens — never the owner.

The first cut set `sourceAssets = Base USDC` while the intent account was the
**HCA**. The user's USDC is on the **EOA**, so the orchestrator looked for Base
USDC on the HCA, found zero, and returned `NO_PLAN_AVAILABLE`. Changing
`recipient` can't fix this — `recipient` governs where funds go, not where they
come from. *(The earlier `sourceAssets`-encoding theory was a red herring.)*

## Why the funds must end up on the EOA

`ETHRegistrar.register()` pulls rent with
`paymentToken.safeTransferFrom(_msgSender(), BENEFICIARY, price)`, and
`_msgSender()` resolves an HCA caller to its registered **EOA owner**
(HCAEquivalence). So the Sepolia USDC must be held by the **EOA** with
`allowance[EOA][registrar]` set (the EIP-2612 permit). Bridging to the HCA does
not satisfy the registrar — it would have to forward to the EOA first.

- ETHRegistrar.sol: https://github.com/ensdomains/contracts-v2/blob/5677359db15edd8b7e2a7cda4798d801ab129c9d/contracts/src/registrar/ETHRegistrar.sol
- HCAEquivalence.sol: https://github.com/ensdomains/contracts-v2/blob/5677359db15edd8b7e2a7cda4798d801ab129c9d/contracts/src/hca/HCAEquivalence.sol

## Why the current integration needs two intents

Using the HCA as the destination executor while delivering bridged funds to the
EOA is supported. The problem is exclusively on the source side: a Warp intent
spends *its account's* balance.

- Fund the bridge from the **EOA** → the intent account must be the **EOA**.
- Execute a *sponsored* `register` paid from the EOA → that's the **HCA** intent.

The current API has no field expressing "spend the EOA's source balance while
the HCA remains the intent account." The practical integration therefore uses
one EOA-funded bridge intent followed by one HCA registration intent.

## This PR (phase 2)

`submitPermitAndRegistrationActor` no longer attaches cross-chain params. It
builds the same-chain permit+register intent and assumes the destination token
already sits on the EOA. `paymentSource` is kept only to select the charged
token. This is correct under any funding option below.

The `L2_STABLES` feature flag remains disabled until phase 1 is implemented, so
the UI cannot select a source that this actor does not yet fund.

## Options to add the funding path (pick one)

**(a) Two-phase: bridge to the EOA, then register.** Phase 1: an EOA-funded
Warp bridge-to-self (EOA is both `account` and `recipient` — supported)
delivers Sepolia USDC to the EOA. Phase 2: the existing HCA permit+register.
Works with today's SDK/orchestrator. Cost: two intents, the EIP-2612 permit
signature, and a wait for the destination balance. *Lowest-risk way to unblock
now.*

**(b) Pre-fund the HCA on Base, single HCA intent.** Move USDC EOA→HCA on Base
once, then one HCA intent bridges HCA→EOA on Sepolia and runs permit+register.
One intent, but needs a manual (non-sponsored) Base deposit into the HCA first.

**(c) 7702-EOA account, one intent, no HCA.** Make the EOA itself the Warp
account via EIP-7702 (`eip7702InitSignature` + the `'eoa'` account type exist in
the SDK). The EOA funds the Base USDC, bridges to itself on Sepolia, and
executes `register` as itself (`msg.sender = owner = EOA`) — no HCA equivalence,
while batching the EIP-2612 permit before `register`. Closest to the desired
UX; biggest change, and sponsored-7702 cross-chain registration is **not yet
validated** end-to-end.

## Open questions for Rhinestone

- Can `auxiliaryFunds` (an existing intent field) express "fund from the EOA"
  while executing as the HCA, avoiding the two-phase split?
- Which EOA account/signing path should the manager use for the phase-1
  bridge-to-self intent?
- Is option (c) (sponsored 7702 cross-chain register) supported today?
