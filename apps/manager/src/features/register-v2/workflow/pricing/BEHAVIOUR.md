# Registration and renewal payment: expected behaviour

This file lists what the registration and renewal pages and payment sheet must do, and the test that holds each rule. A change to any rule below is a product change: it needs the design owner's agreement, and the PR must name the rule and the test it changes.

Sources, in order of authority:

1. Dom's Figma "New registration" (ENS App Beta file, linked from WEB-2121): page frames Registration, Insufficient Funds, In Progress; sheet frames USDC, Load more, In Progress, ETH Swap, Skeleton, Insufficient; Big Balance for an existing balance beyond the name cost.
2. Dom's walkthrough and the decisions recorded on WEB-2121.
3. Decisions agreed with design and product while building it (November 2026), listed under each rule where they differ from or add to the frames.

Paths are relative to this folder. "Sheet tests" means `components/TokenPickerContent.test.tsx`.

## Page card

| Rule | Held by |
| --- | --- |
| Without an existing balance, the card shows the total in USD and the savings pill. | `CheckoutSummaryCard.test.tsx` |
| With one, it shows Name cost, Existing balance and Total. The balance is applied up to the name cost, so the total is never below zero. | `lib/checkoutSummary.test.ts`, `CheckoutSummaryCard.test.tsx` "shows the name cost, the existing balance and the total left to pay" |
| Tier cards headline the total including any premium; the per-year pill stays on the base price and reads "total". | `DurationPresetRow.test.tsx` "headlines the total with any premium..." |
| The button reads "Continue to payment" and opens the sheet. Accepted coins sit under it (USDC and ETH). While preparing it reads "Preparing..." and is disabled with a not-allowed cursor. | `CheckoutSummaryCard.test.tsx` "opens the payment sheet from Continue to payment"; `lib/checkoutAvailability.test.ts` (`getCheckoutAction`) |
| "Insufficient balance" appears only when every balance read succeeded and none covers the total. Wallet USDC and ETH count together, L2 balances count, gas does not (a balance short of the fee is reported in the sheet). A loading or failed read never blocks the button. The page says "Insufficient balance"; only the sheet names a token. | `lib/checkoutAvailability.test.ts`, `CheckoutSummaryCard.test.tsx` "blocks the way to payment when no balance covers the total" |
| While the account balance is unread, the total pulses rather than showing a figure without it. | `lib/checkoutAvailability.test.ts` (`getPageAvailability`) |

## Payment sheet: methods

| Rule | Held by |
| --- | --- |
| Heading "Pay with". Rows show "Est. fee: $X" and the balance "available". The wallet's coins come first, then L2s by balance, then ETH. Three rows show before "Load more"; a selected row further down stays visible. | Sheet tests "lists the wallet first, then quoted L2s by balance, three at a time"; `lib/paymentMethodVisibility.test.ts` |
| A method holding nothing is hidden. A method holding something is listed even when it can't pay. | Sheet tests "lists every method holding something, short or not, and hides the empty wallet", "an empty L2, with nothing left to bridge" › "is not listed" |
| Every L2 holding USDC is listed in registration: before its quote, when it falls short, and when its quote fails. | Sheet tests "shows the wallet and an L2 holding USDC before the L2 is quoted", "lists an L2 that holds USDC but cannot pay...", "lists an L2 holding USDC whose quote failed..." |
| An L2 without a quote shows an estimated fee with "~", never a dash. | Sheet tests "in registration, says a picked short L2 lacks USDC and estimates its fee", "estimates an unquoted L2 from a quoted one..." |
| ETH is listed only when its quote has something to swap. When the wallet's USDC already pays, ETH is not listed. It carries the "Swaps to USDC" badge and its fee and balance in USD. | Sheet tests "with a wallet that pays in USDC, lists ETH only with %s" |
| When the existing balance covers the name and the fee, the methods are hidden and only the receipt shows. | Sheet tests "with a balance beyond the name cost, lists the methods only while the wallet pays" |

## Payment sheet: who picks the method

| Rule | Held by |
| --- | --- |
| With nothing chosen yet, the app picks a wallet coin that can pay first, then the L2 holding the most. When the current method falls short, it moves to whichever method that can pay holds the most, wallet coin or L2 (a tie keeps the wallet coin). ETH is taken only when no USDC method can pay. | `lib/fallbackPaymentChoice.test.ts` ("with nothing chosen, takes a wallet coin that can pay over a bigger L2", "takes the method holding the most", "keeps list order on a tie, so the wallet wins", "prefers any USDC method to the ETH swap"); sheet tests "moves to the L2 holding the most when the wallet cannot pay", "moves to ETH when nothing else can pay..." |
| A method the app picked gives way when a better one can pay: an L2 to a wallet coin, ETH to a wallet coin or an L2. | `lib/fallbackPaymentChoice.test.ts` ("moves ETH it picked to an L2 that can now pay", "moves an L2 it picked back to a wallet coin...") |
| A method the user picked stays selected when it falls short, with the token named: "You do not have enough USDC for this transaction." | Sheet tests "keeps a short wallet coin only when the user picked it", "in registration, says a picked short L2 lacks USDC..." |
| A picked L2 with no route says "Paying from {chain} isn't available right now." | Sheet tests "says a picked L2 whose quote failed cannot be used right now" |
| No shortfall message flashes while another method's balance or quote is still loading. | `lib/fallbackPaymentChoice.test.ts` (`shouldShowWalletShortfall`) |
| While a payment is in flight, the list and figures stay as they were when the user clicked. | Sheet tests "keeps the figures the user confirmed until it settles", "keeps the methods as they were clicked while paying" |

## Payment sheet: receipt and button

| Rule | Held by |
| --- | --- |
| The receipt reads Registration total (the page's total, never a placeholder once known), Estimated network fee (the selected method's), Existing balance only when some is left after the name cost, and You pay. Figures are computed in USDC units and rounded to cents so the lines add up. | `lib/paymentReceiptFigures.test.ts` (`getNetworkFeeReceiptFigures`) |
| Buttons: "Sign approval" for USDC, "Swap and Register" for ETH, "Loading..." while balances or quotes load, "Registering..." while paying, "Register name" (disabled) when the selection can't pay. Every disabled button is grey. | Sheet tests "labels the button $label when the wallet holds $balance", "keeps the wallet locked while payment approval takes longer than a minute". "Swap and Register" has no test yet. |
| When the existing balance covers everything, the button still reads "Sign approval" with "What will I sign?" (Big Balance frame). | Sheet tests "needs no method when the account credit covers it all, bridging nothing" |
| "What will I sign?" stays visible while registering, and is kept on the ETH swap (agreed; the WEB-2121 notes left it out for ETH). | Sheet tests "keeps explaining the signature while registering" |
| The primary-name toggle is hidden. Its default is unchanged: the primary name is set only when the wallet has none and its owned-name count is known and below five (`../../state/registrationAutoSetup.ts`). | `../../state/registrationAutoSetup.test.ts`; no test asserts the toggle is absent |
| A long name wraps before ".eth", never inside it. | `components/EthNameText.tsx` (no test) |

## Known limits, not bugs

- On Sepolia, paying from an L2 fails above about 8 USDC: Across, the only bridge Rhinestone routes on testnets, caps transfers into Sepolia on chain. The sheet lists those L2s with "isn't available right now". To test the L2 path, keep the amount bridged under that cap (an existing balance covering most of the cost).
- A row's "Est. fee" can differ from the receipt's fee by a cent: the receipt sets its fee to You pay minus Registration total so its lines add up exactly.
- Tier prices are slightly above round numbers (for example $8.01 for one year): a year is charged as at least 365.25 days and multi-year terms include leap days. Changing that changes what users pay and needs protocol agreement.

## Pending design changes

- Focus ring drawn inside the row, and no hover tint on the selected row (Dom's feedback, PR #1698).

## Renewal

Single and bulk renewal use the same page card, sheet and receipt as registration (WEB-2133). `TokenPickerContentBase`, `PaymentAction`, `PaymentMethodRow` and the L2 rows are shared, so a change to a rule above changes renewal too. Paths below are relative to `../../../renew` (single) and `../../../bulk-renew` (bulk).

| Rule | Held by |
| --- | --- |
| The renewal page uses the registration card: Name cost, Existing balance and Total, "Continue to payment", "Connect to renew" when disconnected. USDC and ETH sit under the button, and ETH counts toward the balance check, except on the wallet route (EOA, Safe, V1), which can't pay with ETH. | `workflow/pricing/components/PaymentCard.test.tsx` |
| Tier cards read "total", as registration's. | `workflow/pricing/components/DurationSelector.tsx` (no test) |
| On a smart account the sheet passes `checkoutReceipt`: the receipt reads "Renewal total" and its figures read "up to", rounded up to the cent, because the approval carries headroom over the price. | Sheet tests "labels the checkout total and shows its figures as up to, as a caller asks"; `lib/paymentReceiptFigures.test.ts` |
| The renewal total is the price with its headroom, less the account's USDC applied up to it, never below zero. | `utils/renewalFunding.test.ts` (`getRenewalCheckoutTotalRaw`) |
| The ETH row works as in registration: the wallet's ETH is swapped into the wallet's USDC, which the usual permit then moves into the account. The swap buys toward the same amount an L2 payment is sized on (the price with its headroom, plus the fee with its drift margin, less the account's balance), so a small fee change at signing stays covered; unspent USDC stays in the wallet. The button reads "Swap and Renew". Bulk renewal swaps once for every batch. | `service/hcaRenewal.test.ts` "submitHcaRenewal paid with ETH"; `state/renewalUi.machine.test.ts` "renewal paid with ETH"; `../bulk-renew/hooks/useBulkRenewSubmit.test.ts` "pays a whole selection with ETH through one swap..." |
| A swap still confirming is saved, so a retry or reload counts it instead of buying again; a failed swap stops before any permit. | `service/hcaRenewal.test.ts` "counts a swap an earlier attempt sent...", "stops before any permit when the swap fails..." |
| Paid with ETH, an amount re-quoted beyond the drift margin stops the renewal (the wallet holds less USDC than the permit needs) rather than asking for a second swap. Going back to the sheet re-quotes, and the next swap buys only what is missing. | No test yet. |
| Buttons: "Sign approval" on a smart account, "Renew name" / "Renew names" on the wallet route and when the selection can't pay, "Loading..." while quoting, "Renewing..." while paying. | `../bulk-renew/components/BulkRenewPaymentStep.test.tsx` holds "Sign approval"; the other labels have no test yet. |
| The fallback rules above apply: the app's pick gives way, the user's pick stays. Single renewal records who picked in its machine, bulk in its dialog. | `state/renewalUi.machine.test.ts` "records who picked a wallet coin: %s" |
| An increased amount at signing is shown for review before anything is signed (single renewal only). The methods are hidden during the review; "Sign payment approval" or "Sign renewal" accepts it, Cancel returns to the sheet. | `state/renewalUi.machine.test.ts` "increased payment on the smart-account route"; `utils/renewalFunding.test.ts` (`decideRenewalPayment`); sheet tests "hides the methods while the caller asks it to" |
| On the wallet route (EOA, Safe, V1) the sheet keeps its older behaviour: no `checkoutReceipt`, short and unquoted L2s hidden. | Sheet tests "keeps a short L2 hidden in renewal", "keeps an unquoted L2 hidden in renewal", "keeps the existing token row outside registration" |

Not yet in renewal: bulk's increased-amount review, which still asks through `RenewalFundingDialog`.

## Before changing anything here

1. Read the rule and its test. If an existing test fails after your change, the change is wrong unless the ticket changes that rule.
2. Run `pnpm exec vitest run --maxWorkers=4 src/features/register-v2 src/features/renew src/features/bulk-renew` and `pnpm typecheck` from `apps/manager`.
3. Check the screen against the Figma frames at desktop and mobile width.
