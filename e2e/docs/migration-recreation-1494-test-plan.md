# #1494: UserRegistry subname recreation and resolver copy, QA test plan and report

PR: [#1494 feat(manager): add UserReg migration and resolver imports](https://github.com/ensdomains/apps-monorepo/pull/1494) at `2a5cce392`
Tickets: WEB-1933, WEB-1934, WEB-1938, plus review regressions R1 and R2
App: **manager** (`apps/manager`, `:3000`), `packages/migration`
Spec: `e2e/projects/manager/tests/migration-recreation.spec.ts`
Run: `pnpm --filter @ens-apps/e2e exec playwright test --config=projects/manager/playwright.migration.config.ts --project=manager-migration --no-deps migration-recreation.spec.ts`

---

## 1. Change surface

**Before.** Migrating an unwrapped or unlocked `.eth` 2LD could strand its
direct V1 subnames. The old copy path only accepted owned children on a known
public resolver, and recreated names could keep a resolver their V2 owner could
not write.

**After.**

| Area | Change |
|---|---|
| WEB-1934 recreation | Direct 3LDs are recreated in a deterministic UserRegistry inside the parent's atomic batch: effective V1 holder, token `ALL`, `maxUint64`, the exact V1 resolver (including custom and zero). Wallet and HCA hold root `ALL`. No record replay for children. Behind `migration-subname-recreation` |
| WEB-1933 blocks | 4LD+ trees, WrapperRegistry trees, nonzero-fuse wrapped children, incomplete or stale inventories and oversized families keep the parent on ENSv1, at preparation, before every batch and in recovery. No acknowledgement bypass |
| WEB-1938 kept manager | An opted-in distinct V1 controller gets `ROLE_SET_RESOLVER` on the token and the seven record setters (`0x1111111`) on a per-name resolver |
| WEB-1938 resolver copy | Copy, review and replace into a wallet-controlled PermissionedResolver; the pointer moves only after the target is verified; a populated pubkey or a failed required read blocks the switch |
| Review fixes | R1: RESERVED names keep the UniversalResolver/V1 read path. R2: the reservation bonus may be 62 d or 62 d + 1 s, carried from the chain |

**What the PR's own tests do not reach.** The manager Playwright config ignores
every `migration*` spec (`testIgnore`), so CI's browser shards run no migration
flow. These tests run the real UI on a Sepolia fork, real controllers and
UserRegistry proxies, and read every outcome back from the chain.

---

## 2. Automated coverage

Oracles are chain reads. Role holders come from the contract's own
`EACRolesChanged` stream (`helpers/v2-reads.ts`), so "only the wallet and its
HCA hold root roles" covers every grant ever made. The child inventory is
served by `helpers/mock-subname-inventory.ts` with the Anvil head as the
`meta.as_of` checkpoint; owners, resolvers and fuses are read by the app from
the chain.

| # | Test | What it proves | Pre-fix (`main`) | PR |
|---|---|---|---|---|
| 1 | R2: reserved at V1 + 62 d migrates | Plain unwrapped 2LD, flag off: REGISTERED to the owner, exact reservation expiry kept, no UserRegistry | pass (guard) | pass |
| 2 | R2: reserved at V1 + 62 d + 1 s migrates | As 1, with the ETHRenewerV1 bonus | pass (guard) | pass |
| 3 | WEB-1934: recreates every direct child | Parent with three children: registry child of another wallet on the V1 public resolver; zero-fuse wrapped child of a third wallet on a custom resolver; the owner's own child with no resolver. UserRegistry certified; root holders exactly `{wallet: ALL, HCA: ALL}`; each child REGISTERED to its V1 holder, `maxUint64`, its holder the only token-role holder with `ALL`, exact resolver; records still resolve | FAIL: stalls on "Checking your subnames", never upgrades | pass |
| 4 | WEB-1933 flag off: parent with a subname stays on ENSv1 | Reason "Subname copying is not available in this session…", the parent cannot be selected, a childless control upgrades, parent stays RESERVED | FAIL: reason text absent | pass |
| 5 | WEB-1933 flag on: 4LD tree and partial inventory block their parents | Each blocked parent shows its own reason, cannot be selected, stays RESERVED; a childless control upgrades | FAIL: 4LD reason absent | pass |
| 6 | R1: RESERVED V1 profile | A name behind the ENSIP-10-only ENSv1 resolver shows its V1 text and URL records | pass (guard) | pass |
| 7 | WEB-1938 kept manager | Manager holds exactly `ROLE_SET_RESOLVER` on the token; per-name resolver root holders exactly `{wallet: ALL, HCA: ALL, manager: 0x1111111}`; manager `setText` works, `linkToRecord` reverts; `safeTransferFrom` reverts `0x677f1c18` while the manager holds a role; owner `revokeRoles` succeeds and the transfer then simulates clean | FAIL: manager has no record setters (shared owner resolver) | pass |
| 8 | WEB-1938 resolver copy/review/replace | On recreated children: a V1 pubkey shows "Resolver replacement is blocked … pubkey", the review checkbox is disabled, the pointer stays. Without one, Replace & Save moves the pointer to a resolver where the wallet holds `ALL`, the reviewed records resolve from it, the old resolver keeps its copy, the sibling is untouched | FAIL at setup (the stall in 3), not on the copy assertion | pass |
| 9 | Rollout gate | Flag withdrawn on a prepared recreation plan: the page switches to "Your names can't be upgraded", nothing is sent from the wallet, parent stays RESERVED | pass on retry (vacuous: no recreation on `main`) | pass |

Tests 3, 4, 5 and 7 fail on `main` on the assertion that encodes the new
behaviour. Tests 1, 2 and 6 are guards for regressions found in review. Test 8
fails on `main` before reaching its own assertion. Test 9 only discriminates on
the PR build.

---

## 3. Results

- PR build: 9 / 9 pass (10 runs including both R2 variants), each in its own
  run on 2026-10-25 against `2a5cce392`. A consolidated re-run of the whole
  spec afterwards could not get past `/upgrade`: the network to PostHog failed
  about half of all requests and GitHub was unreachable, so every attempt
  bounced to `/dashboard` before reaching PR code. It was stopped and needs
  repeating on a stable connection.
- Unit baseline on the PR build: manager migration + profile 2,100 tests / 166
  files, `packages/migration` 106, `transaction-manager` 394, all pass; manager
  typecheck clean.
- Harness changes, needed to test this PR at all: the e2e harness from
  `e2e-tests-coverage` (main's migration fixtures target the superseded V1/V2
  stack); `makeV1Name` reserves at V1 + 62 d (default) or a given bonus;
  `example` dropped from the ENSv1 resolver probe labels (re-pointed at fork
  block 11983209).
- Environment: Anvil fork at 11983209 via Tenderly. `/upgrade`'s server-side
  PostHog `migration` check has a 1 s budget and redirects on timeout; with a
  slow network some first attempts bounced to `/dashboard` and passed on retry.

---

## 4. Manual plan

Setup: the e2e stack (`anvil alto paymaster mockestrator`), manager on `:3000`
with `.env.ci`, wallet = Anvil account 0. Seed with the spec's fixtures or
`OWNER=user STATE=active pnpm --filter @ens-apps/e2e seed:name`, then create
subnames with `setSubnodeOwner`.

1. Flag off, parent with one subname: `/upgrade` lists the parent under "These
   names need to stay on ENSv1 for now" with the session reason; it cannot be
   selected. **Pass:** a childless name still upgrades.
2. Flag on, parent with a registry child owned by another wallet: upgrade.
   **Pass:** one migration transaction; the child is owned by the other wallet
   in the parent's UserRegistry, with its old resolver.
3. Flag on, parent with a child that has its own child: **Pass:** "subnames with
   further subnames" reason, not selectable.
4. Keep-manager: unwrapped 2LD whose registry owner is a second wallet; tick
   "Keep … as a manager". **Pass:** the second wallet can edit records and change
   the resolver, and nothing else.
5. Recreated child you own with V1 records: profile → Upgrade resolver → review
   → Preview → Publish → Replace & Save. **Pass:** records unchanged after the
   switch. Repeat with a V1 pubkey set: **Pass:** replacement blocked.
6. Reject the final resolver switch in the wallet. **Pass:** the old resolver
   stays active (not automated, see Findings).

---

## 5. Findings

| Severity | Finding |
|---|---|
| Process | CI's manager e2e never runs a migration spec (`testIgnore: /temporaryPremium|migration|notification/`). The PR's "all five shards passed" covers no migration flow |
| Process | `main`'s migration e2e fixtures point at the superseded V1/V2 stack and reserve at the bare V1 expiry, which the PR's new expiry check rejects. They need the `e2e-tests-coverage` fixtures plus the 62 d bonus |
| Low, pre-existing | "Checking your subnames" can spin with no timeout ("Continue migration" disabled, "Back to selection" works). Seen once on the PR build and in every recreation run on `main`; not a regression |
| Low, UX | The selection step lists only the parent while it estimates; the recreated subnames (including ones held by other wallets) are not listed there |
| Not covered | A nonzero-fuse wrapped child (the PR reports the NameWrapper refuses that fixture), and rejecting the final `setResolver` in the wallet (the headless wallet's reject is retried as transient) |
