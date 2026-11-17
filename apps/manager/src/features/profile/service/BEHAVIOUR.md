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
| The smart account falls back to the direct ETH transactions when its USDC and the wallet's together can't cover the quoted fee, and the wallet's ETH covers both transactions' estimated gas. No USDC dialog is shown on that path. | `profile/service/primaryNamePayment.test.ts`; `profile/service/setPrimaryName.test.ts` "sends the direct ETH-paid transactions when there is no USDC" |
| Some USDC but short of the fee counts as "can't pay": ETH is used if it can pay. | `profile/service/primaryNamePayment.test.ts` "some USDC, short of the fee, enough ETH" |
| When the fee can't be quoted, ETH is used if it can pay. With no USDC at all, the fee isn't quoted. | `profile/service/primaryNamePayment.test.ts` "USDC held but the fee could not be quoted, enough ETH"; `profile/service/setPrimaryName.test.ts` "sends the direct ETH-paid transactions when there is no USDC" |
| With neither enough USDC nor enough ETH, the USDC path runs, so the user sees the funding error saying the USDC pays the network fee (WEB-2124). | `profile/service/primaryNamePayment.test.ts` "no USDC and ETH short of the cost", "no USDC and the ETH cost could not be estimated" |

## Records

| Rule | Held by |
| --- | --- |
| Every in-place record write, and the resolver setup before it, is a direct transaction from the owner's wallet, paid in ETH. Registration gives the owner wallet every role on the resolver, so no smart account or USDC is involved. | `profile/components/dialogs/edit-profile/EditProfileDialog.machine.test.ts` "queues an in-place update as an owner-EOA transaction", "queues resolver setup as an owner-EOA save" |
| The ETH address record written while choosing a primary name is also a direct wallet transaction. | No test |

## Known limits

- The ETH path always sends both transactions, including `addr.reverse`. The USDC path only clears a stale `addr.reverse`.
- The ETH cost is the gas estimate × the current max fee per gas, with no buffer. A sharp gas rise between the check and the wallet prompt is left to the wallet to reject.
- The fee is quoted on the larger batch (the stale `addr.reverse` cleared), so it reads high, never low.
- There's no manual USDC/ETH switch; the choice is automatic.
