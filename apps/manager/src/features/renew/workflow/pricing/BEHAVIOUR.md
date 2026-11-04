# Renewal payment: expected behaviour

This file lists what the renewal page and payment sheet must do, for single and bulk renewal, and the test that holds each rule. A change to any rule below is a product change: it needs the design owner's agreement, and the PR must name the rule and the test it changes.

Renewal follows registration (WEB-2133): the same page card, sheet, receipt and fallback, with "Renewal total" in place of "Registration total" and "up to" figures for the approval's headroom. Registration's rules are in `../../../register-v2/workflow/pricing/BEHAVIOUR.md`; `TokenPickerContentBase`, `PaymentAction`, `PaymentMethodRow` and the L2 and ETH rows are shared, so a change to a rule there changes renewal too.

Sources, in order of authority:

1. Dom's Figma "New registration" (ENS App Beta file, linked from WEB-2121), applied to renewal as agreed on WEB-2133.
2. The decisions recorded on WEB-2133 and WEB-1964 (the increased-amount review).
3. Decisions agreed with design and product while building it (November 2026), listed under each rule.

Paths are relative to `apps/manager/src/features`. "Sheet tests" means `register-v2/workflow/pricing/components/TokenPickerContent.test.tsx`.

## Routes

| Rule | Held by |
| --- | --- |
| A smart account renews by an owner-signed intent paid from the account (the intent route). An EOA, a Safe{Wallet} and every V1 renewal renew from the wallet with transactions (the wallet route). While the signer initializes there is no route, never the wallet route. | `renew/utils/renewalPaymentRoute.test.ts` |
| The wallet route skips the session prompt; the intent route goes through it. A Safe waits for its check before anything can reach the prompt. | `renew/workflow/pricing/components/PaymentCard.test.tsx` |
| Only the intent route can pay from an L2 or with ETH. A wallet-route start naming either is refused, never paid from the wallet instead. | `renew/state/renewalUi.machine.test.ts` "never starts a wallet-route renewal that names an L2", "never starts a wallet-route renewal paid with ETH" |

## Page card

| Rule | Held by |
| --- | --- |
| The page uses the registration card: Name cost, Existing balance and Total, "Continue to payment", "Connect to renew" when disconnected. Its loading rules are registration's: a placeholder total while the balance is unread, "Loading..." while the wallet is restored. | `renew/workflow/pricing/components/PaymentCard.test.tsx` "takes a Safe{Wallet} to the token picker..." (the button); the rest has no test |
| USDC and ETH sit under the button and ETH counts toward the "Insufficient balance" check, except on the wallet route, which shows and counts USDC only. | `register-v2/workflow/pricing/lib/checkoutAvailability.test.ts` (the check); the route switch has no test |
| Tier cards headline the total and read "total", as registration's. | `register-v2/workflow/pricing/components/DurationPresetRow.test.tsx` (the shared row); renewal's `DurationSelector.tsx` has no test |

## Payment sheet

| Rule | Held by |
| --- | --- |
| On the intent route the receipt reads Renewal total, Estimated network fee, Existing balance when some is left after the price, and You pay. Its figures read "up to", rounded up to the cent, because the approval carries headroom over the price. | Sheet tests "labels the checkout total and shows its figures as up to, as a caller asks"; `register-v2/workflow/pricing/lib/paymentReceiptFigures.test.ts` |
| The renewal total is the price with its headroom, less the account's balance of the price's coin applied up to it, never below zero, in USDC units (a DAI price is converted). During an increased-amount review the total comes from that prompt, so every row describes the payment being signed. | `renew/utils/renewalFunding.test.ts` (`getRenewalCheckoutTotalRaw`, `getRenewalReceiptTotalRaw`) |
| Methods are listed, hidden and ordered as in registration: every L2 holding USDC, ETH only when it has something to swap (so not while the wallet's USDC pays), and the methods hidden when the account's balance covers everything. | Registration's sheet tests, through the shared base |
| The fallback is registration's: with nothing picked, a wallet coin that can pay first, then the L2 holding the most, ETH last. The app's pick gives way; the user's pick stays and says the token is short. Single renewal records who picked in its machine, bulk in its dialog. | `register-v2/workflow/pricing/lib/fallbackPaymentChoice.test.ts`; `renew/state/renewalUi.machine.test.ts` "records who picked a wallet coin: %s"; `renew/workflow/pricing/useRenewalL2Payment.test.ts` |
| Buttons: "Sign approval" on the intent route, "Swap and Renew" when paid with ETH, "Renew name" / "Renew names" on the wallet route and when the selection can't pay, "Loading..." while quoting, "Renewing..." while paying. | `bulk-renew/components/BulkRenewPaymentStep.test.tsx` holds "Sign approval"; the other labels have no test |
| On the wallet route the sheet keeps its older behaviour: no checkout receipt, short and unquoted L2s hidden. | Sheet tests "keeps a short L2 hidden in renewal", "keeps an unquoted L2 hidden in renewal", "keeps the existing token row outside registration" |

## Paying from an L2

| Rule | Held by |
| --- | --- |
| The L2 bridges the price with its headroom, plus the fee widened for drift, less what the account holds. What the renewal doesn't spend stays in the account. | `renew/utils/l2RenewalAmount.test.ts`; `renew/service/hcaRenewal.test.ts` "bridges what the account is short in, then renews from the account" |
| After the bridge the wallet is never asked for anything; any amount left for it is refused. | `renew/service/hcaRenewal.test.ts` "never asks about the wallet after the bridge..." |
| A payment still settling is waited for, not paid again. | `renew/service/hcaRenewal.test.ts` "keeps an accepted payment that never filled...", "pays nothing while an earlier payment is still unsettled" |
| Bulk renewal bridges once for every batch. | `bulk-renew/hooks/useBulkRenewSubmit.test.ts` "pays a whole selection from an L2 with one bridge..." |

## Paying with ETH

| Rule | Held by |
| --- | --- |
| The wallet's ETH is swapped into the wallet's USDC, which the usual permit then moves into the account. The swap buys toward the same amount an L2 payment is sized on, so a small fee change at signing stays covered; unspent USDC stays in the wallet. | `renew/service/hcaRenewal.test.ts` "swaps for the USDC first, then funds the account with the usual permit" |
| The swap is bounded by the ETH shown: registration's swap step refuses one that would send materially more. | `packages/transaction-manager/src/machines/registration/registration.eth.actors.test.ts` "does not send more ETH than checkout showed" |
| A swap still confirming is saved, so a retry or reload counts it instead of buying again. A failed swap stops before any permit. | `renew/service/hcaRenewal.test.ts` "counts a swap an earlier attempt sent...", "stops before any permit when the swap fails..." |
| Picking ETH pays a USDC renewal and replaces an L2; picking a coin replaces ETH. | `renew/state/renewalUi.machine.test.ts` "pays a USDC renewal with ETH in place of an L2..." |
| Bulk renewal swaps once for every batch, sized when it runs on the names still to renew (as the L2 bridge is), so a retry buys only for those. A failed swap renews nothing. | `renew/service/hcaRenewal.test.ts` "fundHcaRenewalsWithEth"; `bulk-renew/hooks/useBulkRenewSubmit.test.ts` "pays a whole selection with ETH through one swap...", "renews nothing when the ETH swap fails" |
| An amount re-quoted beyond the drift margin stops the renewal (the wallet holds less USDC than the permit needs) rather than asking for a second swap. Going back to the sheet re-quotes, and the next swap buys only what is missing. | No test yet |

## Increased amount at signing (single renewal)

| Rule | Held by |
| --- | --- |
| The intent re-quotes before signing. The same amount, a lower one, or a fraction of a cent more within the cent shown signs straight away; a cent more of either coin is shown for review first. | `renew/utils/renewalFunding.test.ts` (`decideRenewalPayment`) |
| Nothing is signed until the user accepts the new amount, which then stays on screen. The methods are hidden during the review; "Sign payment approval" or "Sign renewal" accepts it, Cancel returns to the sheet and re-quotes. | `renew/state/renewalUi.machine.test.ts` "increased payment on the smart-account route"; sheet tests "hides the methods while the caller asks it to" |

## Bulk renewal

| Rule | Held by |
| --- | --- |
| The intent route renews up to 25 names per intent; a retry resumes after the chunks that landed and never charges a landed chunk again. | `bulk-renew/hooks/useBulkRenewSubmit.test.ts` "splits a large selection into one intent per chunk", "does not charge again for a chunk that renewed but failed its wait", "surfaces a failed intent and resumes..." |
| The wallet route approves the summed price once, then renews the selection in one `renewBatch`. | `bulk-renew/hooks/useBulkRenewSubmit.test.ts` "approves the summed price once, then renews the selection in one renewBatch" |
| The payment step uses the same sheet and receipt as single renewal. | `bulk-renew/components/BulkRenewPaymentStep.test.tsx` |

## Known limits, not bugs

- Bulk renewal has no in-sheet review of an increased amount: each chunk still asks through `RenewalFundingDialog`.
- On Sepolia, paying from an L2 fails above about 8 USDC (Across caps transfers into Sepolia), as in registration.
- Prices are slightly above round numbers ($8.01 for a year): a year is charged as at least 365.25 days.
- The renewal failure screen can show the wallet's raw rejection text.

## Before changing anything here

1. Read the rule and its test. If an existing test fails after your change, the change is wrong unless the ticket changes that rule.
2. Run `pnpm exec vitest run --maxWorkers=4 src/features/register-v2 src/features/renew src/features/bulk-renew` and `pnpm typecheck` from `apps/manager`. A change to the swap or funding steps in `packages/transaction-manager` also needs that package's tests.
3. Check the screen at desktop and mobile width, single and bulk.
