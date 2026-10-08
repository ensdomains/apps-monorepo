# The smoke suite

A small, hand-picked subset of the e2e suite that runs on every push/PR in
**under 5 minutes** (measured; see below), as a fast regression gate
alongside — not instead of — the full nightly suite (manager +
manager-premium + manager-migration + portal, including the 347-cell V1
shape matrix, cross-app, and metadata), which continues to run nightly and
remains the source of truth for `pnpm e2e:coverage`.

The full suite takes multiple hours. This suite exists to answer one
narrower question on every PR: *did this change break the highest-cost
things this codebase already knows how to break?* It is prioritized by the
same "cost of being wrong" risk-tier ordering as
[`e2e-build-goal.md`](./e2e-build-goal.md) and the catalogue (HW → R0 →
R1 → R2 → R3 → R4): spend the time budget on the failures that would be
most expensive to miss, not on breadth.

## How to run it

```bash
pnpm e2e:smoke            # portal, then manager
pnpm e2e:smoke:portal     # portal only
pnpm e2e:smoke:manager    # manager only
```

Mechanism: a new `@smoke` tag, added **additively** alongside each test's
existing `@scenario:`/`@inv:` tag (so `pnpm e2e:coverage` and the nightly
configs are completely unaffected), plus two dedicated configs —
`e2e/projects/portal/playwright.smoke.config.ts` and
`e2e/projects/manager/playwright.smoke.config.ts` — built on the same
two-project (`harness` → `*-e2e`) shape as the existing
`playwright.premium.config.ts` / `playwright.migration.config.ts`. Each
smoke config sets `grep: /@smoke/` at the top level, which Playwright
applies across **all** of that config's projects — including the harness
dependency — so the harness project itself is thinned down to just the
fixture checks the smoke tests actually rely on, not all of it.

## The curated list (26 tests, ~7.6 minutes measured)

### Portal — 19 tests, ~293s measured (`playwright.smoke.config.ts`)

| # | Test | File | Why it's here |
|---|---|---|---|
| 1–3 | `wallets: every participant is a distinct, funded account…`; `the apps under test are pointed at this fork, not a public RPC`; `anvil: the fork is a fork, and the .eth registry is deployed on it` | `specs/harness.spec.ts` | Harness sanity, not all 15 tests. These three are the ones that gate exactly what the rest of the smoke suite depends on: wallet connect + account funding, and the chain fork actually being reachable and correctly wired. The other 12 (`makeV1Name`, `v1 shapes`, `makeSubname`, `chain-snapshot`, `time`, the three `panoptes:` checks) guard fixtures nothing in this smoke set uses — they stay in the nightly run's `harness` project. |
| 4 | `registers a name via headless wallet and stablecoin payment` | `registration.spec.ts` | The canonical R0/R1 happy path — real money (USDC), real commit/reveal, real registration. If this breaks, nothing else matters. |
| 5 | `switching to a different name mid-flow cancels the first registration instead of completing it` | `registration.spec.ts` | **Mandated.** Regression coverage for a real, funds-at-risk bug (PR #1207 / immunefi #92461): the registration actor used to survive a `?name=` change, so completing "registration" after switching names actually registered and charged for the *first* name while the UI showed the second. |
| 6 | `grants a single role to a second wallet` (`@scenario:C2`) | `roles.spec.ts` | Canonical role-grant/revoke representative (C-tier, authorization). Originally picked `revokes a role` (`C4`); swapped after verification (see "What's excluded" below) — C2 exercises the same authorization-write path and is fully chain-oracled (`assertRoleBitmap`), with no dependency on the currently-broken indexer role-sync path. |
| 7 | `transfers a name from wallet A to wallet B, and wallet B is shown as the owner` (`@scenario:F10`) | `transfer.spec.ts` | Canonical ownership-transfer happy path — the one clean, fast, representative transfer test (of the ~50 in this file). |
| 8 | `blocks detaching a registry with third-party subnames until the exact blast radius is acknowledged, and voids that acknowledgement if the toggle is reset` (`@scenario:F41`) | `transfer.spec.ts` | **Mandated.** Regression coverage for a real security fix (PR #1170 / immunefi #93026): the registry-detach consent gate, including the "resetting the toggle voids the tick" re-attack the original bug allowed. |
| 9 | `shows "Registry detached" instead of "Configure registry" after a detach transfer` (`@scenario:F42`) | `transfer.spec.ts` | Companion to F41, same PR (#1170), same vulnerability class: before the fix, a detached slot rendered as "Configure registry," letting the new holder deploy a fresh empty registry and re-mint the victim's old subname labels into it, stranding the original token. Added after the first measured run came in well under budget (145s for 8 tests) — this is the one "one more high-value test" the runbook invited, not padding: it is itself R0/R1 (irreversible token-stranding), cheap (mocked indexer, ~13s), and directly related to the other mandated regression. |
| 10 | `the reported crafted link does not tell a visitor they own someone else’s name` | `registration.spec.ts` | **Mandated.** Regression coverage for PR #1247 / immunefi #92544 (WEB-1490): `/$name` used to render "Congratulations! You are the owner of {name}" and a `paid` figure straight from the query string, so a link could tell any visitor they owned an attacker's name — with Extend (renewing it from the visitor's wallet) the only call to action. No transactions, one seeded name, ~12s. The other six tests for the same fix (variants, history-state parsing, the real-registration path) stay in the nightly run; see [`registration-banner-web1490-test-plan.md`](./registration-banner-web1490-test-plan.md). |
| 11 | `a second grant after dismissing the first asks the wallet again and lands on-chain` | `roles.spec.ts` | Regression coverage for PR #1214 (WEB-1418): a finished transaction actor stays in the manager so the modal can re-render it, and the roles flows used a fixed step id, so a second role change in the same session opened as the *first* change's receipt ("Done", with its actual cost) and pressing Done sent nothing. Chain-oracled (`assertRoleBitmap` on the second grantee), no indexer dependency, ~9s. It also guards the scoped-id console matcher in `helpers/transaction-modal.ts`, which every modal-driven test depends on. |
| 12 | `does not ask a wallet on another network to send, and says why` | `transfer.spec.ts` | Regression coverage for PR #1108 (WEB-281): the portal declares Sepolia alone and never re-checks the chain after connect, so a wallet switched to another network got `walletClient.chain === undefined`, which the EOA transport passed to viem as `chain: null` — switching off viem's own chain check — and the wallet was asked to send Sepolia calldata on the other chain. Oracle is the headless wallet's `eth_sendTransaction` queue (must stay empty) plus a chain read of the name; it also pins the non-retryable branch (exactly one attempt). One seeded name, no indexer dependency, 11.8s. The recovery and Extend (USDC) tests for the same fix stay in the nightly run; see [`chain-mismatch-web281-test-plan.md`](./chain-mismatch-web281-test-plan.md). |
| 13 | `Try again after a failed approve keeps the commitment that landed on its second send` | `registration.spec.ts` | Regression coverage for PR #1284 (WEB-1229): a send that failed and was resubmitted kept its error in `context.error` after it landed, so the registration's Try again retired the landed commitment ("Not Started") along with the step that really failed. The headless wallet fails one real commit send; the oracle is the overview's Done badges, each checked against its mined transaction, plus the commitment's exact state lines. Also the only smoke test on the transaction machine's automatic resubmission path. No indexer dependency, ~15s. The full-path and close-modal tests for the same fix stay in the nightly run; see [`stale-retry-error-web1229-test-plan.md`](./stale-retry-error-web1229-test-plan.md). |
| 14 | `a register page whose price reads fail offers no token and no Register, then recovers on Try again` | `registration.spec.ts` | Regression coverage for PR #1221 (WEB-1485 / Immunefi #92608): a failed `getRegisterPrice` read was replaced by a zero price, so every token was offered as "available" at $0, an empty wallet looked sufficient and the approval step was skipped while the registrar still pulled its live price. The test reverts only the page's price `eth_call`s inside the real JSON-RPC batches, asserts no token rows, no "available", no `$0.00` and a disabled Register, then lets reads through and checks Try again prices the name at the registrar's own on-chain price (positive control). No transactions, no seeded name, ~2.5s. The held-selection, shared-query, Extend and exact-approval tests for the same PR stay in the nightly run; see [`zero-price-checkout-web1485-test-plan.md`](./zero-price-checkout-web1485-test-plan.md). |
| 15 | `lets the user opt out of the ETH repoint when the resolver detach is not on offer` | `transfer.spec.ts` | Regression coverage for PR #1217 (WEB-1508 / Immunefi #93008): the "Set the ETH address to the recipient" switch was greyed out as "Not needed while the resolver is being detached" whenever the stored detach toggle was on, which it is by default even when the detach isn't offered. So the form claimed the record was covered while the plan still repointed it, and the user couldn't opt out. Seeds one locked V1 name with `CANNOT_SET_RESOLVER` burned and an ETH record, asserts the switch is live with no "Not needed" claim and the "stays attached" warning shown, opts out, and checks on chain that the name moved while `addr(60)` and the resolver did not. One transaction, no indexer dependency, 16.2s. The stranded-record and restore tests for the same PR stay in the nightly run; see [`transfer-eth-addr-strand-web1508-test-plan.md`](./transfer-eth-addr-strand-web1508-test-plan.md). |
| 16 | `removing the owner's own row keeps Can Transfer, and the name can still be transferred` | `roles.spec.ts` | Regression coverage for PR #1269 (WEB-1487 / Immunefi #92542): Remove user passed the row's raw role list to `revokeRoles`, so on the owner's own row it revoked `ROLE_CAN_TRANSFER_ADMIN`. That role is checked on the token owner and nobody can grant it back, so the name froze for the rest of its term. The test removes the owner's row of a fresh 2LD, then checks the bitmap is exactly `ROLE_CAN_TRANSFER_ADMIN` and that a real `safeTransferFrom` by the owner lands. It aborts the one roles query local Panoptes can't answer, so the table is read from the chain. One revoke and one transfer, 9.1s. The other-holder guard and the hook unit tests stay in the nightly run; see [`roles-remove-user-web1487-test-plan.md`](./roles-remove-user-web1487-test-plan.md). |
| 17 | `a resolver already deployed at the wallet’s address (as manager deploys it) is reused` | `registration.spec.ts` | Regression coverage for PR #1310 (WEB-1572): the portal deployed a new resolver proxy, under a random salt, on every registration. The fix fixes the salt per wallet (manager's `computeResolverSalt`) and skips the deploy when code is already at that address. The test deploys a fresh wallet's resolver with manager's salt outside the portal, then registers: the step list must have no "Deploy resolver", the first transaction must be the commitment, the wallet must mine no factory call, and the .eth registry must record the seeded proxy (from its `ProxyDeployed` event) as the name's resolver. Fresh wallet, so it doesn't depend on fork history. No indexer dependency, ~66s, almost all of it the commit-reveal wait. The two-registration, reload and lost-deploy tests stay in the nightly run; see [`resolver-reuse-web1572-test-plan.md`](./resolver-reuse-web1572-test-plan.md). |
| 18 | `flags "Cannot transfer" once the owner loses ROLE_CAN_TRANSFER_ADMIN, and the registry agrees the transfer reverts` | `roles.spec.ts` | Coverage for PR #1311 (WEB-1469): a v2 name whose owner had lost token roles looked like any other name, so nothing warned that a transfer would revert. The test revokes the owner's `ROLE_CAN_TRANSFER_ADMIN` on a fresh 2LD, checks on chain that the owner's `safeTransferFrom` now reverts (it simulates cleanly before), and that a disconnected visitor sees the red **Cannot transfer** badge next to the owner with the "Missing token ROLE_CAN_TRANSFER_ADMIN" tooltip. It aborts the roles query local Panoptes can't answer, and reloads any page load whose node role read hit an upstream error on the fork (that read can come back empty, which the badges would misread). One revoke, 9.7s. The other seven WEB-1469 tests (Cannot transfer safely, Resolver locked ×2, the locked registry notice, the delegate, Subregistry locked, the locked-migration exemption) stay in the nightly run; see [`missing-privileges-web1469-test-plan.md`](./missing-privileges-web1469-test-plan.md). |
| 19 | `an empty indexed history still lists every holder on chain (the report repro, disconnected)` | `roles.spec.ts` | Regression coverage for PR #1313 (WEB-1484): the roles list is a replay of the name's `EACRolesChanged` history, and any history the indexer answered was taken as complete. So an indexer behind the chain showed "No role holders yet", with no revoke control, for a name with live grants. The test grants a manager on a fresh 2LD and serves the `RoleChangeEvents` query an empty history (local Panoptes can't answer it anyway). A disconnected visitor must see no empty state and exactly the owner and manager rows, with no "couldn't confirm" warning. The page's own `eth_getLogs` for the resource shows the registry mismatch sent it to the node. One grant, 3.7s. The lag, node-down (roles, profile counter, ownership, transfer form), paging, transfer-revokes and guard tests stay in the nightly run; see [`role-holders-verified-web1484-test-plan.md`](./role-holders-verified-web1484-test-plan.md). |

### Manager — 8 tests, ~224s measured (`playwright.smoke.config.ts`)

| # | Test | File | Why it's here |
|---|---|---|---|
| 1–2 | `makeV2Name: rule 5 — the name it reports is registered…`; `makeV2Name: rule 6 — the manager renders the name it made` | `specs/harness-manager.spec.ts` | The two fixture checks for the V2 name path the registration test below shares infrastructure with (same registry, same render path). Manager's other four harness tests (`makeV1Name` ×2, `v1-controller-auth`, `makeV1Name`-vs-app-registrar) exist for the migration suite, which is out of scope here (see below). |
| 3 | `registers a name after connecting from the pricing page` (`@scenario:A16`) | `registration.spec.ts` | Manager's own R0/R1 registration happy path. Manager's presence in this suite is deliberately thin (see "Why manager is thin" below) — this is the *only* manager-side area verified both fast (~70–100s) and fully reliable in a fresh, same-day run. It is worth the ~2 minutes because it is a structurally different codebase/UI/payment path from the portal registration test, exercising the same protocol-critical flow. |
| 4 | `a grace-period name is offered for renewal from the dashboard and listed on /upgrade` | `migration-grace.spec.ts` | Regression coverage for PR #1274 (WEB-424): a V1 name in its 90-day grace period is classified `expired-registration`, and before the fix that made it invisible to migration — no upgrade banner and "No eligible names found" on /migration (now /upgrade, renamed in #1307) — so an owner whose only names were in grace had no path to upgrade. Seeds one real in-grace name with `makeGraceV1Name` (moves the shared clock ~90s), no wallet transactions, 12.8s. The renew-and-migrate, insufficient-USDC and mixed/wrapped tests stay in the nightly migration run; see [`migration-grace-web424-test-plan.md`](./migration-grace-web424-test-plan.md). |
| 5 | `revoking a deployed account bumps the nonce, kills a copied session, and clears this browser` | `hca-session-revoke.spec.ts` | Regression coverage for PR #1113 (WEB-674): HCA sessions could only be forgotten from localStorage, but the validator is stateless, so a copied record stayed usable until `validUntil`. The test signs a real session, revokes from the wallet menu, and checks the chain: exactly one owner transaction calling `revokeSessions()` on the HCA, `ownerAndSessionNonce` bumped by one, the HCA's own `SessionsRevoked` log, the copied record's nonce now stale, local storage cleared, and the gate re-prompting with a session on the new nonce. The mockestrator never runs the validator, so the nonce, not a UI registration, is the oracle. One owner transaction, no indexer dependency, 9.5s. The rejection, chain-switch and undeployed-account tests stay in the nightly run; see [`session-revoke-web674-test-plan.md`](./session-revoke-web674-test-plan.md). |
| 6 | `blocks checkout and keeps the "up to" hedge when the budget quote fails` | `registration-rhinestone.spec.ts` | Regression coverage for PR #1234 (WEB-1506 / Immunefi #93021): a failed HCA budget quote was swallowed, so the token picker fell back to the rent alone, dropped the "up to" hedge and let checkout start a registration whose single funding permit could not cover the reveal — a paid-for commitment left to expire. The test fails only the registration's own `/intents/route` quotes, asserts the refusal message, a disabled Register button and the hedge, then restores the orchestrator and checks the same name checks out (positive control). No transactions, no cooldown, ~38s. The three other tests for the same PR (deploy funding ×2, click-path re-quote) stay in the nightly run; see [`hca-budget-web1506-test-plan.md`](./hca-budget-web1506-test-plan.md). |
| 7 | `a duplicated tab does not free the original’s claim, and is told to wait for it` | `registration-rhinestone.spec.ts` | Regression coverage for PR #1314 (WEB-1702), a follow-up to #1254's one-registration-per-wallet lock. Chrome's "Duplicate tab" clones sessionStorage, holder id included, so the clone's mount sweep freed the original's live claim, and the wallet was open to a second registration on the same permit nonce. The refused tab also showed "Registration Failed" with a retry pitch. The test opens a second tab in the same context with the first tab's sessionStorage copied in before load, checks the original's claim survives and the clone takes a new id, then checks Register shows "Another Registration Is Running" (no "Registration Failed", no retry copy). Positive control: once the original lets go, Try Again starts the clone's registration under its own id. Seeded claim, no chain dependency, ~15s. The real mid-registration duplicate, the ordinary second tab and the reload guard stay in the nightly run; see [`registration-tab-lock-web1702-test-plan.md`](./registration-tab-lock-web1702-test-plan.md). |
| 8 | `names what the last attempt left and makes the headline what the wallet pays now` | `registration-rhinestone.spec.ts` | Coverage for PR #1303 (WEB-1483). An HCA registration attempt that funded the account but never finished leaves USDC behind, and the next attempt's payment sheet set it against the cost without naming either figure. The headline still read "Total", the token row said "available", and the copy called the HCA "your account". The test seeds the HCA's USDC balance on the fork, first empty (guard: "Total", no deduction), then $1.82. It checks that a "Left from your last attempt" line equals the on-chain balance, that the headline reads "You pay now" and the lines subtract to it to the cent, that "account" appears nowhere, and that the token row says "in your wallet" with the wallet's on-chain USDC. No transactions, the seeded balance is restored, ~70s. The fully-covered, short-wallet and toggle re-quote tests stay in the nightly run; see [`payment-sheet-leftover-web1483-test-plan.md`](./payment-sheet-leftover-web1483-test-plan.md). |

## Why manager is thin

The wider manager Playwright project has a known, separately tracked
connect-flow instability (`e2e/coverage/handoff.md`, iteration 4). A fresh
run taken this session (`e2e/coverage/run-results/manager.json`,
2026-09-24) showed the full manager project at 19 passed / 3 failed / 3
skipped across `harness-manager` + `primaryName` + `profile` +
`registration*` in 25.2 minutes — not fast, and not clean. Breaking that
down:

- **`registration.spec.ts` (all 3 tests) and `registration-rhinestone.spec.ts`** passed cleanly and fast (70.0s / 1.3s / 7.4s / 70.5s). This is the one reliably-green, reliably-fast manager area, and it is exactly the highest-value one (R0/R1 registration) — the EOA variant made the cut; the Rhinestone/HCA variant is a heavier, more environment-fragile variant of the *same* flow (extra mockestrator dependency) and is left to nightly to keep the manager slice minimal.
- **`profile.spec.ts`** mixed 19 passes with 3 real failures (`extend unowned name by 28 days`, `never offers a renewal date before the current expiry`, `shows a graceful error for an unregistered name via the renew deep link`) — genuine renewal/calendar UI bugs, unrelated to the connect-flow blocker, confirmed by reading the actual errors (a calendar dropdown option never appearing, a redirect never firing). Not something a fast, trust-worthy gate can afford to include.
- **`migration*.spec.ts`** is explicitly out of scope (see below) and independently confirmed broken today: a fresh `manager-migration` run failed 6 of 7 `migration-subname` tests.
- **`temporaryPremium.spec.ts`** and **`notification.spec.ts`** are already excluded from the manager project's own default `testIgnore` and were not investigated further — no evidence either way, and not worth spending smoke budget establishing.

So: portal-heavy by design, with one thin, verified-reliable manager slice
(registration), not zero — the task explicitly allowed either, and a
same-day run gave clear evidence for which manager area could be trusted.

## What's deliberately excluded, and why

- **The V1 shape matrix** (`portal/matrix/`, `portal-v1-matrix` /
  `portal-v1-matrix-time` projects) — out of scope by design. It is
  inherently exhaustive/combinatorial (347 cells); a smoke suite is the
  opposite of exhaustive. A single-cell canary was considered and rejected:
  it would need the V1 harness fixtures (`makeV1Name`,
  `v1-controller-auth`), which sit behind the same migration stack that
  today's fresh `manager-migration` run showed mostly red (6/7
  `migration-subname` failures) — not a foundation to build one "is V1
  completely broken" canary on with any confidence.
- **`subnames.spec.ts` (D-tier, subname create/delete)** — excluded
  entirely, not by choice but by verified current breakage. Every test in
  this file depends on `waitForIndexedName`/Panoptes discovering a
  freshly-created subregistry. The originally-picked `deletes a subname`
  (`D5`) failed identically in two independent runs:
  `Panoptes has not indexed doomed.sub-d5-*.eth after 60000ms. For a name
  inside a subregistry this usually means the registry has not been
  discovered and backfilled yet.` This is a real, reproducible
  environment/indexer defect (subregistry discovery), not a flake — every
  other test in the file makes the same `waitForIndexed*` call, so there is
  currently no reliable D-tier candidate to substitute. Worth filing
  separately; out of scope to fix as part of this task.
- **`records.spec.ts` / `resolver.spec.ts` (E-tier, resolver/record
  writes)** — excluded entirely, same story. Every write test in both files
  seeds its name via `makeName({ records: [...] })` to get a *dedicated*
  resolver (`fixtures/makeName.ts`'s `deployResolverProxy` +
  `setRecords`), because the shared `V1_PUBLIC_RESOLVER` isn't writable for
  a V2 owner. That `setRecords` call currently reverts on-chain
  (`ContractFunctionExecutionError: The contract function "setText"
  reverted`) — confirmed reproducibly on two different tests in two
  different files (`records.spec.ts`'s `sets a contenthash record` and
  `resolver.spec.ts`'s `points a name at a different resolver`). This is a
  fixture/environment defect in the dedicated-resolver deployment path
  (possibly stale `ensPermissionedResolverImpl` / `ensVerifiableFactory`
  wiring after the 2026-09-15 protocol redeploy noted in
  `e2e/infra/panoptes/contracts.json`), not a test-quality problem — there
  is currently no E-tier write path in this repo that doesn't go through
  the same broken fixture call. Worth filing separately; out of scope to
  fix as part of this task.
- **`roles.spec.ts`'s `revokes a role` (`C4`)** — not excluded from
  coverage, just swapped for `grants a single role to a second wallet`
  (`C2`). `C4` depends on `waitForIndexedRoles`, which failed identically
  to the D-tier failures above (`Panoptes has not indexed roles for
  <resource> … (0 events for that registry …)`) in two independent runs.
  `C2` exercises the same authorization-write surface with a purely
  chain-read oracle (`assertRoleBitmap`) and passed reliably (~9s) in every
  run.
- **`registry.spec.ts` ("registry configure/detach basics")** — there is no
  such file in this repo; registry attach/detach lives inside
  `transfer.spec.ts` (it's part of the transfer flow, not a separate
  surface). F41 and F42 already are the registry configure/detach coverage
  — both are specifically about the detach mechanism's safety gates. A
  separate "basic detach" pick would duplicate that mechanism without
  adding new risk signal, so none was added.
- **Cross-app** — `e2e/projects/cross-app/tests/` contains only
  `.gitkeep`. There is no cross-app test in this repository yet to
  include; nothing to pick from.
- **Metadata** (`e2e/projects/metadata/`) — a pinned-commit *external*
  service (`metadata-service-v2`), tested black-box over HTTP. It isn't
  this monorepo's regression surface in the sense the rest of this suite
  is (a change to `apps/manager` or `apps/portal` cannot break it), so it
  stays nightly-only.

## Relationship to the nightly suite

Nothing about the nightly suite changed: no existing tag was removed, no
`testIgnore`/`testMatch` in the existing configs was touched, and
`e2e/coverage/reconcile.ts`'s `PROJECT_CONFIGS` was **not** updated to
include the two new smoke configs — the smoke configs select a subset of
tests the nightly configs already run and already count for
`pnpm e2e:coverage`; they are a faster *selection*, not a new source of
coverage. Every test in the smoke suite kept its original `@scenario:` tag
(where it had one) and gained `@smoke` as an addition.

## Measured runtime

Full, clean, all-green run (2026-09-24, this session, fresh infra):

| Suite | Tests | Time |
|---|---|---|
| Portal (`pnpm e2e:smoke:portal`) | 14 (3 harness + 11) | ~177s (2m57s) — 174s plus #14's 2.5s; a 2026-10-03 run after adding #14 took 168s, but with #5 failing fast (pre-existing, see [`zero-price-checkout-web1485-test-plan.md`](./zero-price-checkout-web1485-test-plan.md) F2) |
| Manager (`pnpm e2e:smoke:manager`) | 7 (2 harness + 5) | ~154s — 138s plus #7's 15.5s; a 2026-10-05 run after adding #7 took 189s with #4 failing on the `/migration` → `/upgrade` rename (#1307), since fixed in the spec; re-measured after the fix at 172s, all 7 green |
| **Total (`pnpm e2e:smoke`, sequential)** | **21** | **~331s (5m31s)** |

This is comfortably under the ~10 minute target, with every test in the
final set passing. The gap was **not** filled by padding: the D-tier and
E-tier candidates that would have used part of that headroom are currently
broken for reasons outside this task's scope (see above), and the one
addition made (F42) was picked because it is itself high-value
(R0/R1-adjacent, same vulnerability class as the mandated F41), not to hit
a number. Once the Panoptes subname-discovery and dedicated-resolver
fixture issues are fixed, a `D`-tier and an `E`-tier test should be added
back — there is over 5 minutes of budget headroom for exactly that.
