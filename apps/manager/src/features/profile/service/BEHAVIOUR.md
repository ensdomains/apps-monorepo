# Primary name and record updates: payment

This file lists how setting a primary name and updating records pay for gas, and the test that holds each rule. A change to any rule below is a product change: the PR must name the rule and the test it changes.

Registration and renewal payment are out of scope; their rules are in `../../register-v2/workflow/pricing/BEHAVIOUR.md` and `../../renew/workflow/pricing/BEHAVIOUR.md`.

Sources, in order of authority:

1. WEB-2132 and the discussion linked from it (November 2026): anything that buys nothing must be payable in ETH; USDC stays the default when it can pay.
2. WEB-2124 for the funding error's wording.

Paths are relative to `apps/manager/src/features`.

## Primary name

| Rule | Held by |
| --- | --- |
| A Safe{Wallet}, or a wallet without a smart account, sends the two direct transactions (`default.reverse`, then `addr.reverse`) and pays gas in ETH. | `profile/hooks/useSetPrimaryName.test.tsx` "a Safe{Wallet} sends both transactions itself"; `profile/service/setPrimaryName.test.ts` "setPrimaryName" |
| A smart account pays in USDC by default: one owner-signed intent, with any shortfall pulled from the wallet after the user approves the network fee. | `profile/service/setPrimaryName.test.ts` "keeps the USDC intent when the wallet covers the quoted fee", "setPrimaryNameWithHca funding" |
| The smart account falls back to ETH when its USDC and the wallet's together can't cover the quoted fee, and the wallet's ETH covers the estimated gas at the fee a wallet charges by default: twice the base fee plus MetaMask's 2 gwei "Market" tip, not the node's far lower estimate. No USDC dialog is shown on that path. | `profile/service/primaryNamePayment.test.ts`; `profile/service/setPrimaryName.test.ts` "with no USDC, the owner pays in ETH and ...", "keeps the USDC path when the ETH covers the node fee but not a wallet tip" |
| On the ETH route the owner sends the HCA batch's writes itself, through the same adapters' owner entry points (`DefaultReverseRegistrarAdapter.setName(owner, name)`, then `ReverseRegistrarAdapter.claim(owner, 0)` only when a stale `addr.reverse` would shadow it), one transaction each. The name ends up stored exactly as the USDC route stores it. | `profile/service/setPrimaryName.test.ts` "with no USDC, the owner pays in ETH and writes default.reverse through the adapter", "... also clears a stale addr.reverse through the adapter" |
| Some USDC but short of the fee counts as "can't pay": ETH is used if it can pay. | `profile/service/primaryNamePayment.test.ts` "some USDC, short of the fee, enough ETH" |
| When the fee can't be quoted, ETH is used if it can pay. With no USDC at all, the fee isn't quoted. | `profile/service/primaryNamePayment.test.ts` "USDC held but the fee could not be quoted, enough ETH"; `profile/service/setPrimaryName.test.ts` "with no USDC, the owner pays in ETH and ..." |
| A wallet balance (USDC or ETH) that can't be read counts as nothing, and never stops a USDC payment that can go ahead without it. | `profile/service/primaryNamePayment.test.ts` "... is unread" rows; `profile/service/setPrimaryName.test.ts` "keeps the USDC intent when USDC covers the fee and the wallet ETH read fails", "... the HCA covers the fee and the wallet USDC read fails" |
| With neither enough USDC nor enough ETH, the USDC path runs, so the user sees the funding error saying the USDC pays the network fee (WEB-2124). | `profile/service/primaryNamePayment.test.ts` "no USDC and ETH short of the cost", "no USDC and the ETH cost could not be estimated" |

## Records

| Rule | Held by |
| --- | --- |
| Every in-place record write, and the resolver setup before it, is a direct transaction from the owner's wallet, paid in ETH. Registration gives the owner wallet every role on the resolver, so no smart account or USDC is involved. | `profile/components/dialogs/edit-profile/EditProfileDialog.machine.test.ts` "queues an in-place update as an owner-EOA transaction", "queues resolver setup as an owner-EOA save" |
| The ETH address record written while choosing a primary name is also a direct wallet transaction. | No test |

## Known limits

- A Safe{Wallet} keeps the older two-transaction flow, which writes `addr.reverse` with the name rather than clearing it.
- The ETH cost assumes MetaMask's default tip. A wallet set to a higher fee, or a base fee more than doubling before the prompt, can still find the ETH short; the wallet then rejects it. A wallet with less ETH than that, but enough for a lower fee it would accept, goes to the USDC path.
- The fee and the ETH cost are both taken on the larger batch (the stale `addr.reverse` cleared), so they read high, never low.
- There's no manual USDC/ETH switch; the choice is automatic.
