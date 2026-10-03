# WEB-424: Grace-period names in the migration flow, QA test plan and report

PR: [#1274 feat: include grace-period names in migration flow](https://github.com/ensdomains/apps-monorepo/pull/1274)
App: **manager** (`apps/manager`, `:3000`)
Spec: `e2e/projects/manager/tests/migration-grace.spec.ts` (`Grace-period names in migration (WEB-424)`)

---

## 1. Change surface

**The bug.** A V1 `.eth` 2LD inside its 90-day grace period is classified
`expired-registration`, so it was ineligible and invisible to migration. An
owner whose only V1 names were in grace saw no upgrade banner, and /migration
said "No eligible names found for this wallet" with "Upgrade 0 names". The only
way out was to renew somewhere else first.

**How a user reaches it:** let a V1 name lapse, then open the manager within 90
days of expiry.

**The fix, by role.**

| Role | File(s) | What changed |
|---|---|---|
| Reader | `useEligibleV1Names(.helpers)`, `useV1NameClassificationTime` | Returns `gracePeriodNames` beside `eligible`. Grace is judged against `Date.now()`, re-evaluated at the next expiry boundary. Cached RPC eligibility is intersected with fresh classification, so a newly expired name can't stay selectable |
| UI | `UpgradeBanner`, `SelectNamesStep*`, `NameRow`, `WalletConfirmationStepsDialog`, `GameStep` | "Renew Names" banner, the "N names need renewal" note, the ↻ "Renew before upgrade" badge, renewal cost and the renewal steps in "What you'll approve", the "Insufficient USDC" block |
| Quote | `graceRenewal.getGraceRenewalQuote`, `useGraceRenewalQuote` | Re-reads each name on chain at one block, checks `isRenewable`, prices `now − expiry + 7d` (min `MIN_RENEW_DURATION`) in USDC, and reads the balance. Refetched every 30s |
| Fee estimate | `estimateGraceRenewalGas`, `estimateGraceRenewalMigrationGas` | Approve + `renewBatch` simulated together (`eth_simulateV1`), plus the migration plan built against the *projected* renewed expiries |
| Writer | `graceRenewal.executeGraceRenewal`, `graceRenewalPending` | Approve if short, then `ETHRenewerV1.renewBatch`. A pending record is kept in `localStorage` under a Web Locks lock, so a reload reconciles instead of paying twice |
| State | `migrationUi.machine` | `select → migrate.renewing → migrate.preparing → migrate.running`, with retry targeting whichever stage failed |
| Cache writer | `useSyncRenewedV1Names` | Patches the renewed domains into the `v1_names` query so the plan is built from post-renewal data |

**What must still work:** bulk upgrades mixing active and grace names in one run; migrating active names with no grace name selected
(no renewal steps, unchanged fee path); mixed selections; wrapped names, whose
NameWrapper expiry must be synced by the renewal or the transfer reverts.

**What the PR's unit tests don't reach:** a real in-grace name on the fork, the
real renewer (`isRenewable`, `getRenewPrice`, `renewBatch`) and USDC token,
the USDC actually charged against the quoted figure, the renewed name landing
in the V2 registry, and the dashboard-to-/migration routing.

## 2. Automated coverage

All e2e tests seed **real** in-grace names with `makeGraceV1Name` (new fixture).
It registers for 90s directly on the BaseRegistrar as an authorised controller,
reserves the V2 slot at `v1Expiry + PREMIGRATION_BONUS_PERIOD` as real
pre-migration does, and steps just past expiry. That moves the shared fork
clock by about 90s per name. `makeV1Name({ duration: -N })` would move it 28+
days, because of the controller's minimum registration. The browser clock is
installed at chain time (`syncBrowserToChain`), because the app judges grace
from `Date.now()`.

| Test | What it proves | Pre-fix | PR |
|---|---|---|---|
| `a grace-period name is offered for renewal from the dashboard and listed on /migration` (`@smoke`) | Dashboard row loaded, then the banner reads "Renew your grace-period name…" with **Renew Names**. Clicking it lands on /migration titled "Renew your names before upgrading", with the name ticked and described "Renew before upgrade" | ✘ banner absent | ✓ |
| `renews then upgrades a grace-period name, charging the USDC the dialog quoted` | The dialog orders the renewal steps before every migration step. After the upgrade: `nameExpires` > old expiry and > chain now; USDC spent **equals** `getRenewPrice(label, newExpiry − oldExpiry)` at the pre-upgrade block and is within 1% of the dialog quote; `assertUnlockedMigration` (V2 REGISTERED, no subregistry) | ✘ name not listed | ✓ |
| `blocks the upgrade when the wallet cannot pay for the renewal` | With 0 USDC: an alert reads "Not enough USDC…", **Insufficient USDC** is disabled, the wallet queue stays empty, and `nameExpires` is unchanged. Positive control: the test above | ✘ name not listed | ✓ |
| `upgrades an active name and a wrapped grace-period name together, renewing only the grace one` | The banner adds "1 name needs renewal before it can be upgraded."; both names ticked; the badge is only on the grace name; the dialog ends "Upgrade 2 names" after the renewal steps; the grace name's expiry is extended and both are REGISTERED in V2. A stale NameWrapper would make the wrapped transfer revert, so success is the wrapper-sync oracle | ✘ renewal note absent | ✓ |
| `bulk: two active and three grace-period names (unwrapped, wrapped, locked) upgrade together` | All 5 listed and ticked, the badge on exactly the 3 grace names. The dialog shows **one** "Renew 3 names" step before every migration step and ends "Upgrade 5 names". After one run: every grace expiry > chain now; USDC spent **equals the sum** of the three on-chain renewal prices, within 1% of the quote; both active and the unwrapped/wrapped grace names REGISTERED in V2; the locked grace name REGISTERED under a WrapperRegistry (`assertLockedMigration`) | ✘ only the 2 active names listed | ✓ |
| `deselecting the grace-period name upgrades only the active name, with no renewal` | Positive control: the grace name is offered and ticked by default. Unticked: no renewal cost and no renewal steps in the dialog (ends "Upgrade 1 name"). After the upgrade: active REGISTERED in V2, USDC unchanged, grace expiry unchanged and the slot still RESERVED; back on /migration the grace name is still offered, titled "Renew your names before upgrading" | ✘ grace name not offered (positive control) | ✓ |
| `several grace-period names on their own: plural banner and one batched renewal` | Dashboard "Renew your 2 grace-period names before upgrading…" + **Renew Names** → /migration; both ticked; the dialog shows one "Renew 2 names" step and ends "Upgrade 2 names" with a USDC cost | ✘ banner absent | ✓ |
| Unit: `useSyncRenewedV1Names.test.ts` (3 cases) | Writer → reader round trip through the real `useV1Names` query: the renewed domain replaces the stale one in place, without a refetch; a checksummed owner hits the lowercased key; another owner's cache is untouched; nothing is written before renewal completes | — (new file, stays green) | ✓ |

Runner: `playwright.migration.config.ts` now matches
`migration-(subname|grace).spec.ts`. `migration.spec.ts` is excluded from every
config, which is why these tests live in their own file.

## 3. Results (PR merged onto `e2e-tests-coverage`)

| Check | Result |
|---|---|
| `migration-grace.spec.ts`, PR build | 7/7 pass (2.8m) |
| `migration-grace.spec.ts`, 16 PR app files reverted to `e2e-tests-coverage` | 7/7 fail, each on the bug assertion (banner, plural banner or renewal note absent; grace name checkbox absent; in the bulk case only the 2 active names listed). The page shows "No eligible names found for this wallet" / "Upgrade 0 names" |
| Manager migration unit tests | 1167/1167 pass (85 files) |
| `pnpm typecheck` (manager, e2e) | pass |
| `pnpm test:manager-smoke` | 4/4 pass (2.0m); the new `@smoke` test takes 12.8s |
| Screenshots | `QA_SHOTS_DIR=<dir>` saves 1440×900 screenshots at each test's key states; unset, the hook is a no-op |
| Chain state after the run | `mg-renew-*` and `mg-wrapped-*`: REGISTERED in V2, V1 expiry about 6 days ahead. `mg-nousdc-*` and `mg-list-*`: not migrated, still expired |

### Status after merge (2026-10-02)

At 11:53 UTC on 2026-10-01, live Sepolia removed `ETHRenewerV1` as a BaseRegistrar controller. Every fork since inherits it, and `renewBatch` can't renew. The 4 tests that renew or estimate a renewal are marked as expected failures while the role is missing; each test checks the role on chain at start-up. See "Live Sepolia removed two controllers on 2026-10-01" in [`e2e-defects.md`](./e2e-defects.md). The listing (`@smoke`), insufficient-USDC and deselect tests are unaffected. The results above were measured on a fork from before the change.

## 4. Manual test plan

### Setup

```sh
# Stack (CI service set), then fund the test account
docker compose -f e2e/infra/docker-compose.yml up -d anvil alto paymaster mockestrator
bash e2e/infra/scripts/fund-account.sh 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

# Manager with the dev panels, and the default V1 subgraph URL (the CI .env
# points at /v1-subgraph, which the migration tool's injection doesn't match)
VITE_MIGRATION_TOOL=1 VITE_TIME_TRAVEL=1 \
VITE_V1_SUBGRAPH_URL=https://v1-graphql.ens.dev/subgraph \
pnpm --filter manager dev -- --port 3000

# Seed: one active + grace unwrapped / wrapped / locked, owned by Anvil #0
pnpm --filter @ens-apps/e2e seed:grace-v1
```

Point a browser wallet at `http://127.0.0.1:8545` (chain 11155111) as Anvil
account #0. Paste the printed `document.cookie = …` line into the manager's
console and reload, then **Dev tools → Time travel → Sync**. Repeat Sync after
each reload. Without it the browser clock is behind the fork, and the names
read as active.

Avoid the migration tool's "Grace RW" presets: they advance the shared clock
by about 410 days per click.

### Steps

Do these in order. Each upgrade removes the names it migrated.

1. **Dashboard, mixed.** Close the welcome modal. *Pass:* "Upgrade your names…" plus "3 names need renewal before they can be upgraded."
2. **/migration list.** *Pass:* all 4 ticked; the ↻ "Renew before upgrade" badge only on the 3 grace names; title "Your names are ready to upgrade".
3. **Not enough USDC.** Tick a grace name, run `pnpm --filter @ens-apps/e2e seed:grace-v1 usdc:drain`, reload and Sync. *Pass:* "Not enough USDC to renew these names…", **Insufficient USDC** disabled, no wallet prompt. Restore with `… usdc:restore`.
4. **Active only.** Untick the grace names. *Pass:* no renewal steps in "N requests"; Upgrade migrates the active name.
5. **One grace name** (unwrapped). *Pass:* the dialog shows "Estimated renewal cost" in USDC and *Renew 1 name* before the migration steps. After Upgrade, USDC drops by about the quote and the name opens as a migrated profile.
6. **Grace-only dashboard** (2 left). *Pass:* "Renew your 2 grace-period names before upgrading…", **Renew Names**, /migration titled "Renew your names before upgrading".
7. **Wrapped + locked together.** *Pass:* *Renew 2 names*, one renewal transaction, both migrate (the locked one under a WrapperRegistry; automated in the bulk test).
8. **Recovery (exploratory).** Reload while the renewal transaction is pending (*pass:* resumes, no second charge). Reject the renewal, then retry (check the "Discard unresolved renewal?" copy). Open /migration in two tabs (*pass:* "A renewal is already running in another tab").

## 5. Findings

| # | Severity | Finding |
|---|---|---|
| 1 | — | **No app defects found** on the paths covered: renew + migrate for unwrapped, wrapped and **locked** grace names; a 5-name bulk run mixing 2 active and 3 grace names (one batched renewal, one migration); deselecting a grace name; several grace names alone; the insufficient-USDC block. Quote, charge and on-chain price agree |
| 2 | Low (UX) | The onboarding "Welcome to the new ENS app!" modal counts only eligible names ("You have 1 names…"). It ignores grace names and doesn't open for an owner whose names are all in grace. May be intended |
| 3 | Low (UX) | With too little USDC, the footer shows "Not enough USDC to renew these names…" **and** "Couldn't estimate the network fee" beneath it. The fee simulation fails for the same reason (no USDC to approve and spend), so the second line is noise that suggests a separate problem. Suggest suppressing the fee error while `balance < totalAmount` |
| 4 | Low (dev tooling, not this PR) | `packages/dev-migration-tool` reports a resolver for every wrapped name but answers `getProfilesForDomains` only for record-bearing presets. Migration preflight then fails with `ProfileFetchError: Profile key inventory omitted 1 requested resolver-backed node`, shown as "Couldn't estimate the network fee". This likely affects the panel's own Wrapped/Locked presets too |
| 5 | Low (dev tooling) | The "Grace RW (wrapped)" preset tooltip says renewal leaves the NameWrapper stale and migration reverts. `ETHRenewerV1.renewBatch` now syncs the wrapper, and wrapped renew + migrate passes here |
| 6 | Info (test infra) | `migration.spec.ts` isn't run by any config. `makeV1Name`'s negative-duration path moves the shared clock 28+ days and reserves without the pre-migration bonus, so it can't seed realistic grace names. Hence `makeGraceV1Name` |

**Not covered automatically:** names past the 90-day grace (unit tests only;
the e2e would need a 90-day warp), and the recovery paths in manual step 8.
