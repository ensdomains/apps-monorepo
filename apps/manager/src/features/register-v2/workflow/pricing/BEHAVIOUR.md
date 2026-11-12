# Registration payment: expected behaviour

This file lists what the registration page and payment sheet must do, and the test that holds each rule. A change to any rule below is a product change: it needs the design owner's agreement, and the PR must name the rule and the test it changes.

Sources, in order of authority:

1. Dom's Figma "New registration" (ENS App Beta file, linked from WEB-2121): page frames Registration, Insufficient Funds, In Progress; sheet frames USDC, Load more, In Progress, ETH Swap, Skeleton, Insufficient; Big Balance for an existing balance beyond the name cost.
2. Dom's walkthrough and the decisions recorded on WEB-2121.
3. Decisions agreed with design and product while building it (November 2026), listed under each rule where they differ from or add to the frames.

Paths are relative to this folder. "Sheet tests" means `components/TokenPickerContent.test.tsx`.

## Page card

| Rule | Held by |
| --- | --- |
| Without an existing balance, the card shows the total in USD and the savings pill. Under the total, in both layouts, "+ network fees": the page's total leaves the fee to the sheet. | `CheckoutSummaryCard.test.tsx` (the layouts); the "+ network fees" note is design copy and has no test |
| With one, it shows Name cost, Existing balance and Total. The balance is applied up to the name cost, so the total is never below zero. | `lib/checkoutSummary.test.ts`, `CheckoutSummaryCard.test.tsx` "shows the name cost, the existing balance and the total left to pay" |
| Tier cards headline the total including any premium; the per-year pill stays on the base price and reads "total". | `DurationPresetRow.test.tsx` "headlines the total with any premium..." |
| The button reads "Continue to payment" and opens the sheet. Accepted coins sit under it (USDC and ETH). While preparing it reads "Preparing..." and is disabled with a not-allowed cursor. | `CheckoutSummaryCard.test.tsx` "opens the payment sheet from Continue to payment"; `lib/checkoutAvailability.test.ts` (`getCheckoutAction`) |
| "Insufficient balance" appears only when every balance read succeeded and none covers the total. Wallet USDC and ETH count together, L2 balances count, gas does not (a balance short of the fee is reported in the sheet). A loading or failed read never blocks the button. The page says "Insufficient balance"; only the sheet names a token. | `lib/checkoutAvailability.test.ts`, `CheckoutSummaryCard.test.tsx` "blocks the way to payment when no balance covers the total" |
| Until the page knows the wallet and its balance (server render, session restore, a reconnect the account hasn't synced to, the balance read), the card shows the no-existing-balance layout ("Total USD") with a placeholder set in the total's own type, since nothing yet says the user has a balance; it moves to Name cost / Existing balance / Total only once a balance above zero is read, and the button reads "Loading..." (disabled), not "Connect". It never shows a figure the balance hasn't been applied to. A smart account that failed to start is not waited on: the button reads "Connect to register". | `components/CheckoutSummaryCard.test.tsx` "assumes no existing balance and shows no total while %s", "waits with a disabled Loading button while the account is restored"; `lib/checkoutAvailability.test.ts` (`getPageAvailability`, "waits while the account is still being restored...", `isAccountPending`) |

## Payment sheet: methods

| Rule | Held by |
| --- | --- |
| Heading "Pay with". Rows show "Est. fee: $X" and the balance "available". The wallet's coins come first, then L2s by balance, then ETH. Three rows show before "Load more"; a selected row further down stays visible. | Sheet tests "lists the wallet first, then quoted L2s by balance, three at a time"; `lib/paymentMethodVisibility.test.ts` |
| A method holding nothing is hidden, and so is a wallet coin holding under a cent (it would show as $0.00; an ETH payment leaves such dust behind). A method holding something is listed even when it can't pay. | Sheet tests "lists every method holding something, short or not, and hides a wallet holding %s", "an empty L2, with nothing left to bridge" › "is not listed" |
| Every L2 holding USDC is listed in registration: before its quote, when it falls short, and when its quote fails. | Sheet tests "shows the wallet and an L2 holding USDC before the L2 is quoted", "lists an L2 that holds USDC but cannot pay...", "lists an L2 holding USDC whose quote failed..." |
| An L2 without a quote shows an estimated fee with "~", never a dash. | Sheet tests "in registration, says a picked short L2 lacks USDC and estimates its fee", "estimates an unquoted L2 from a quoted one..." |
| ETH is listed only when its quote has something to swap. When the wallet's USDC already pays, ETH is not listed. It carries the "Swaps to USDC" badge and its fee and balance in USD. | Sheet tests "with a wallet that pays in USDC, lists ETH only with %s" |
| When the existing balance covers the name and the fee, the methods are hidden and only the receipt shows. | Sheet tests "with a balance beyond the name cost, lists the methods only while the wallet pays" |

## Payment sheet: who picks the method

| Rule | Held by |
| --- | --- |
| With nothing chosen yet, the app picks a wallet coin that can pay first, then the L2 holding the most. When the current method falls short, it moves to whichever method that can pay holds the most, wallet coin or L2 (a tie keeps the wallet coin). ETH is taken only when no USDC method can pay. When nothing can pay, ETH is still taken over a wallet coin the list hides (one holding under a cent), so the shortfall shown is the row on screen (WEB-2139). | `lib/fallbackPaymentChoice.test.ts` ("with ETH listed but short, takes ETH over a wallet coin the list hides"), sheet tests "moves to ETH, short as it is, rather than blaming a USDC row the list hides"; `lib/fallbackPaymentChoice.test.ts` ("with nothing chosen, takes a wallet coin that can pay over a bigger L2", "takes the method holding the most", "keeps list order on a tie, so the wallet wins", "prefers any USDC method to the ETH swap"); sheet tests "moves to the L2 holding the most when the wallet cannot pay", "moves to ETH when nothing else can pay..." |
| Closing the sheet, or going back to the duration, forgets the pick: the next open starts from the fallback again, whoever picked (WEB-2139). | `../../state/registrationUi.machine.test.ts` "forgets the pick when the sheet closes..." |
| A method the app picked gives way when a better one can pay: an L2 to a wallet coin, ETH to a wallet coin or an L2. | `lib/fallbackPaymentChoice.test.ts` ("moves ETH it picked to an L2 that can now pay", "moves an L2 it picked back to a wallet coin...") |
| A method the user picked stays selected when it falls short, with the token named: "You do not have enough USDC for this transaction." | Sheet tests "keeps a short wallet coin only when the user picked it", "in registration, says a picked short L2 lacks USDC..." |
| A picked L2 with no route says "Paying from {chain} isn't available right now." | Sheet tests "says a picked L2 whose quote failed cannot be used right now" |
| No shortfall message flashes while another method's balance or quote is still loading. | `lib/fallbackPaymentChoice.test.ts` (`shouldShowWalletShortfall`) |
| While a payment is in flight, the list and figures stay as they were when the user clicked. | Sheet tests "keeps the figures the user confirmed until it settles", "keeps the methods as they were clicked while paying" |

## Payment sheet: receipt and button

| Rule | Held by |
| --- | --- |
| The receipt reads Registration total (the page's total, never a placeholder once known), Estimated network fee (the selected method's), Existing balance only when some is left after the name cost, and You pay. Figures are computed in USDC units and rounded to cents so the lines add up. | `lib/paymentReceiptFigures.test.ts` (`getNetworkFeeReceiptFigures`) |
| "Estimated network fee" carries an info tooltip, as "Existing balance" does: the fee funds the ENS account, and what the network doesn't use stays there as existing balance for the next payment. No other line is added to the receipt. With ETH selected, "You pay" names the coins that leave the wallet: the wallet's own USDC that the payment spends first (only when it holds some), then "up to" the most ETH the swap sends plus its gas, with what that comes to in USD underneath ("≈ $X USD"). It is shown in coins rather than as a USD figure to match the lines above, because the swap is priced by the pool while the USD figure uses the Chainlink price; on Sepolia the pool is far off the feed, so a USD-only line never added up (WEB-2146). On mainnet the USD figure exceeds the total plus the fee by the swap's buffer (the fee widened for drift, slippage and the pool fee). A wallet short of ETH is told how much more ETH it needs for the swap and its gas, and nothing else: the row already shows what the swap takes and what the wallet holds (agreed on WEB-2139, November 2026). | Sheet tests "explains what happens to the network fee the fill does not use", "shows the most the swap sends as what the wallet pays, with ETH selected", "shows the ETH the swap sends, and the USDC the wallet spends first, as what it pays", "holds checkout and says how much when the wallet is short of %s"; `lib/ethPaymentRow.test.ts` (`getEthPaymentRow`, `getEthPaymentDebit`) |
| Buttons: "Sign approval" for USDC, "Swap and Register" for ETH, "Loading..." while balances or quotes load, "Registering..." while paying, "Register name" (disabled) when the selection can't pay. Every disabled button is grey. | Sheet tests "labels the button $label when the wallet holds $balance", "keeps the wallet locked while payment approval takes longer than a minute". "Swap and Register" has no test yet. |
| When the existing balance covers everything, the button still reads "Sign approval" with "What will I sign?" (Big Balance frame). | Sheet tests "needs no method when the account credit covers it all, bridging nothing" |
| "What will I sign?" stays visible while registering, and is kept on the ETH swap (agreed; the WEB-2121 notes left it out for ETH). | Sheet tests "keeps explaining the signature while registering" |
| The primary-name toggle is hidden. Its default is unchanged: the primary name is set only when the wallet has none and its owned-name count is known and below five (`../../state/registrationAutoSetup.ts`). | `../../state/registrationAutoSetup.test.ts`; no test asserts the toggle is absent |
| A long name wraps before ".eth", never inside it. | `components/EthNameText.tsx` (no test) |
| When the HCA budget quote fails with no fallback figures, the receipt shows dashes and the CTA is "Try again" with "We couldn't calculate the total. Please try again." Payment stays blocked. | Sheet tests "offers only a retry, with no figures, when the required quote failed"; `TokenPickerContent.budget.test.tsx` |
| When Rhinestone refuses a quote because execution gas exceeds what the route declares to its planner (name price + `HCA_MAX_LEG_FEES_USDC`; not the wallet's balance), the receipt keeps the page's total as the registration total (the name price when no quote has landed yet, so no existing balance is read) and dashes for the fee and You pay. The warning above the CTA reads "Network fees are elevated right now, if you'd still like to register this name, please use the Explorer", with "Explorer" linking to this name's register page there (`getExplorerRegisterUrl`) when the network has an Explorer, and as plain text when it has none (mainnet today). No amount and no add-funds or shortfall message. Nothing is added under the receipt. "Try again" stays and payment stays blocked. The fallback fees are never shown: on a refusal they are a flat placeholder, not a gas estimate. | Sheet tests "on a refused quote shows the name price with no fee or You pay, and still blocks payment"; `TokenPickerContent.budget.test.tsx` "on a gas-coverage refusal shows the name price, no fee figure, an Explorer link, and still blocks checkout"; `components/GasRefusalWarning.test.tsx`; `lib/budgetQuoteRecovery.test.ts` |
| Any other failed quote (a timeout, the orchestrator down) gets the generic "We couldn't calculate the total" and dashes, even when a fallback breakdown exists. | `lib/budgetQuoteRecovery.test.ts` "stays generic for a non-gas fallback" |

## Known limits, not bugs

- On Sepolia the app pays in ensjs' MockUSDC, which only exists on L1. It has no Uniswap pool or bridge route, so ETH buys Circle's USDC and an L2 bridges Circle's USDC, which the registrar also accepts. A run paid with ETH or from an L2 pays in it throughout: its rows and budget are quoted in it against what the account holds of it, and it signs with a session of its own, one more signature the first time. The token follows the chosen method, not the bridge: a chosen L2 with nothing left to bridge (say, a retry once the bridge landed) still pays in Circle's USDC, from what the account holds.
- On Sepolia, paying from an L2 fails above about 8 USDC: Across, the only bridge Rhinestone routes on testnets, caps transfers into Sepolia on chain. The sheet lists those L2s with "isn't available right now". To test the L2 path, keep the amount bridged under that cap (an existing balance covering most of the cost).
- A row's "Est. fee" can differ from the receipt's fee by a cent: the receipt sets its fee to You pay minus Registration total so its lines add up exactly.
- Tier prices are slightly above round numbers (for example $8.01 for one year): a year is charged as at least 365.25 days and multi-year terms include leap days. Changing that changes what users pay and needs protocol agreement.

## Pending design changes

- Focus ring drawn inside the row, and no hover tint on the selected row (Dom's feedback, PR #1698).

## Shared with renewal

`TokenPickerContentBase`, `PaymentAction`, `PaymentMethodRow` and the L2 and ETH rows are shared with single and bulk renewal, which follow this design (WEB-2133). A change to a rule above changes renewal too. Renewal's own rules, and where it differs, are in `../../../renew/workflow/pricing/BEHAVIOUR.md`.

## Before changing anything here

1. Read the rule and its test. If an existing test fails after your change, the change is wrong unless the ticket changes that rule.
2. Run `pnpm exec vitest run --maxWorkers=4 src/features/register-v2 src/features/renew src/features/bulk-renew` and `pnpm typecheck` from `apps/manager`.
3. Check the screen against the Figma frames at desktop and mobile width.
