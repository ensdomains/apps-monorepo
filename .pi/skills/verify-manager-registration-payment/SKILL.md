---
name: verify-manager-registration-payment
description: "Verify that Manager registration payment stays bound to the method and figures the user clicked across async balance, quote, fallback, React-render, and registration-start orderings. Use when changing the payment sheet, PaymentAction, useHeldWhile, fallback selection, payment queries, or registration start preparation."
compatibility: "Requires mise; the sensitivity script installs pinned Java and TLA+ tools."
---

# Verify Manager registration payment confirmation

## Property and harm

**Property:** once the user presses an enabled registration payment button, the displayed method and consent-relevant payment bounds must remain those from that click, and any eventual `registration.start` must use that snapshot or abort.

**Harm if it breaks:** the app can silently switch wallet USDC, an L2 chain, or ETH, or bind registration to different payment bounds than the sheet showed. That can produce an unexpected wallet request, failed funding, or a registration attempt the user did not confirm.

This verifies the PR #1708 rule: “While a payment is in flight, the list and figures stay as they were when the user clicked.” It does not formalize every rule in `BEHAVIOUR.md`.

## Coverage record

Last synchronized with code commit: `e37040946b2b1e51f7667faf782c17305581ddec`

Covered code:

- `apps/manager/src/features/register-v2/workflow/pricing/BEHAVIOUR.md`
- `apps/manager/src/features/register-v2/workflow/pricing/components/PaymentAction.tsx`
- `apps/manager/src/features/register-v2/workflow/pricing/components/TokenPickerContent.tsx`
  - `availabilityMutation`
  - `startRegistration`
  - fallback settlement gate
  - `TokenPickerContentBase`
- `apps/manager/src/features/register-v2/workflow/pricing/hooks/useHeldWhile.ts`
- `apps/manager/src/features/register-v2/workflow/pricing/hooks/useFallbackPaymentChoice.ts`
- `apps/manager/src/features/register-v2/state/registrationUi.machine.ts`
  - payment-selection events

Verification files:

- `apps/manager/verification/registration-payment/RegistrationPayment.tla`
- `apps/manager/verification/registration-payment/RegistrationPayment.cfg`
- `apps/manager/verification/registration-payment/RegistrationPayment.view.mjs`
- `apps/manager/verification/registration-payment/verify-source-map.mjs`
- `apps/manager/verification/registration-payment/verify-sensitivity.sh`

Do not move the sync commit forward merely because TLC ran. Move it only after confirming that every modeled action still describes the code at the new commit.

## Model-to-code map

Treat a browser click, each XState event, each query notification, each React commit, each passive effect callback, and each continuation after `await` as a separate atomic boundary unless the implementation explicitly combines them.

| Model action | Code meaning | Atomicity represented |
| --- | --- | --- |
| `UserSelect` / `FallbackSelect` | a pricing selection event updates the registration UI actor | one XState event |
| `ClickPayment` | `PaymentAction` calls `onNext`, which calls `availabilityMutation.mutate()` | one button event; current code passes no payment-view snapshot |
| `RefreshFigures` | a balance, budget, L2 quote, or ETH quote changes payment props without changing the actor snapshot | one query/account update and React render |
| `ObserveBusy` | `TokenPickerContentBase` first sees `isBusy=true`; `useHeldWhile` captures that render’s props | one React commit, separate from the click and refresh |
| `DispatchRegistrationStart` | `startRegistration` checks the actor snapshot and sends `registration.start` or returns | one post-`await` continuation and possible XState send |

The current configuration records observed code facts:

- `CaptureViewAtClick = FALSE`
- `HoldViewWhileBusy = TRUE`
- `LockSelectionAtClick = FALSE`
- `BindStartMethodToClick = FALSE`
- `BindStartFiguresToClick = FALSE`
- `AbortOnActorChange = TRUE`

Change a constant only when the code actually changes that fact. Never change one merely to make an invariant pass.

## Run

From the repository root, first prove that the model still maps to the synchronized source:

```sh
node apps/manager/verification/registration-payment/verify-source-map.mjs
```

Then use pstack `/skill:statechart` to check `RegistrationPayment.tla` with the adjacent current config and view module, writing results to a new scratch directory outside the repository. Read every result through `/skill:statechart`; do not judge raw TLC output alone.

Finally run the sensitivity suite:

```sh
apps/manager/verification/registration-payment/verify-sensitivity.sh
```

The sensitivity command must pass. It proves that the hardened click-snapshot model passes and that removing each busy hold, selection lock, actor abort, or start-data binding changes the verdict.

## Current expected findings

At the synchronized commit, `/skill:statechart` explores 408 states and reports three failures:

1. **`InFlightViewMatchesClick`** — click, then a balance or quote refreshes before the first busy render; live figures replace the clicked view.
2. **`PendingSelectionIsStable`** — click, then a selection event lands before `isBusy` gates controls and fallback; the selected method changes during the pending attempt.
3. **`StartedPaymentMatchesClick`** — click, figures refresh, busy renders, then `registration.start` may use the later render-scope figures rather than the click figures.

`ChangedActorNeverStarts` holds: when a selection changes the XState actor snapshot, the stale-click comparison aborts the start.

Keep failures as findings. Do not weaken invariants to match the implementation, and do not change product code unless the user asks.

## Real-code replay and evidence

The view counterexample was replayed against the real `TokenPickerContentBase`:

1. Render the existing `owed` fixture (`You pay $0.04`) with `isBusy=false`.
2. In one rerender, provide the existing `covered` fixture and `isBusy=true`.
3. Assert that the receipt still says `$0.04`.

The assertion fails because the component shows `$0.00`. The existing test passes only because it forces an intermediate busy render with the old figures before refreshing them. The scratch replay test was removed after confirmation.

For start-data binding, the installed TanStack Query `5.104.4` was replayed with a pending `MutationObserver`: updating observer options before resolution caused the refreshed render’s `onSuccess` callback to run. In this component, that callback closes over render-scope wallet debit, L2 charge, and ETH funding. Recheck this dependency behavior if the TanStack version changes.

For every future counterexample:

1. replay each action in order against the real component and current dependency versions;
2. treat a path as a modeling error if a real code or framework guarantee makes a step impossible;
3. otherwise report the path in product terms.

## Update after an intended code change

1. Read the behaviour rule and every covered source boundary.
2. Compare covered files with the sync commit.
3. Keep click, query refresh, busy render, fallback effect, awaited preparation, and XState send as separate actions unless the code makes them atomic.
4. Update model actions and constants to describe the code, not the desired outcome.
5. Update source facts in `verify-source-map.mjs`.
6. Use `/skill:statechart` and replay every counterexample against real code.
7. Run `verify-sensitivity.sh`; the hardened configuration must pass and each removed guard must fail.
8. Deliberately remove one real guard in a scratch change, update the model to that scratch code, and confirm the corresponding invariant fails.
9. Drop the scratch change, rerun, and confirm the result returns to the intended baseline.
10. Only then update the sync commit in this file and `verify-source-map.mjs`.

Use `/skill:maintain-formal-verification-skill` when covered code changed without this verification being rechecked.

## Scope and assumptions

Verified exhaustively within this model:

- one registration payment attempt;
- wallet, ETH, and two distinct L2 methods;
- one consent-relevant figures refresh;
- selection changes before or after the click;
- the first busy render;
- the actor-snapshot abort and possible `registration.start`;
- at most two modeled actor revisions.

Not covered:

- exact USDC, L2, or ETH arithmetic;
- which payable L2 holds the most;
- receipt cent rounding;
- transaction-manager, wallet, bridge, swap, or contract execution;
- renewal-only visibility rules or the rest of `BEHAVIOUR.md`;
- live browser proof. The current view finding has a component-level replay, not an end-to-end wallet replay.
