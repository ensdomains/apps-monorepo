# #1494: UserRegistry subname recreation and resolver copy, QA test plan and report

PR: [#1494 feat(manager): add UserReg migration and resolver imports](https://github.com/ensdomains/apps-monorepo/pull/1494), first at `2a5cce392`, re-verified at `b0480bcc8` after main (#1496, #1497, #1498, #1502, #1506) was merged in
Tickets: WEB-1933, WEB-1934, WEB-1938, plus review regressions R1 and R2
App: **manager** (`apps/manager`, `:3000`), `packages/migration`
Specs: `e2e/projects/manager/tests/migration-recreation.spec.ts`, `e2e/projects/portal/tests/recreated-subnames.spec.ts`
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

### 2b. After the merges into the branch (`b0480bcc8`)

None of #1494's own migration, profile or package code changed; the new
commits are explorer (portal) changes for the names #1494 recreates, plus the
manager primary-name picker. "Pre-merge" is the same test against `2a5cce392`;
for `b0480bcc8` it is the new head with only that commit's two files reverted.

| # | Test | What it proves | Pre-merge | `b0480bcc8` |
|---|---|---|---|---|
| 10 | #1506 + #1496: explorer on a recreated child | The V1 holder (another wallet) sees the record and "Edit records" on the kept V1 PublicResolver, saves, and the write lands there; a stranger gets "Permission Denied" with no editor; after `Graveyard.clear()` the holder gets the plain denial (not the fuse lock) and reads still work | FAIL: editor not reachable for the holder | pass |
| 11 | b0480bcc8: no stale V1 records | Stage 1: the child's V2 resolver cleared, the parent's still set: "No records set". Stage 2: the parent's cleared too, so the walk finds no resolver: the Records page must still show none | stage 1 pass; with `b0480bcc8` reverted, stage 2 shows "zoe stale v1" | **FAIL at stage 2: still shows "zoe stale v1"** (finding) |
| 12 | #1502: grace gap | A V1 name whose V2 reservation lapsed (AVAILABLE) inside V1 grace shows its records and opens the editor | FAIL: records not shown | pass |
| 13 | #1497: primary-name picker | Two unmigrated V1 names are offered; one with no writable resolver shows "…needs a resolver this wallet can write…" and nothing is sent | FAIL: V1 name not offered | pass |

Tests 1–9 re-run at `b0480bcc8`: all pass (some after retries for upstream
RPC timeouts in fixture setup).

### 2c. Acceptance criteria after merge (`46b457d8d`, branch `retrofit/pr-1494-tests`)

Run on the merged test branch with Anvil fork 11983209. Some runs needed retries for upstream RPC timeouts in fixture setup; no assertion was retried away.

**WEB-1934 (direct-3LD recreation)**

| Criterion | Status | Evidence |
|---|---|---|
| Inventory reconciled vs the reviewed snapshot and resulting owners, resolvers, roles, expiry | met | Test 3: three children, three holders; exact holder, token `ALL`, `maxUint64`, exact resolver; root holders `{wallet, HCA}` from the full role log |
| Agreed authority; allowed and denied actions for both wallets | met | Permissions test: the holder may set its own resolver and subregistry and `unsafeTransfer` its name; `safeTransferFrom` is refused with `TransferUnsafeUntilRegistryIsEmancipated` while the parent keeps root roles (by design, #1391); the holder cannot touch a sibling, register, or grant itself root roles; an unrelated wallet cannot unregister. The parent can register and reclaim: after `unregister` the holder loses control, and the re-registered name starts a fresh role scope |
| Records readable through retained resolvers; review before replace | met | Tests 3, 8, 10 |
| Unsupported trees blocked with explanation and docs link; no acknowledgement bypass | met | Tests 4, 5, A1–A4, docs link (`/dashboard#subname-upgrades` resolves), phone viewport |
| Abandonment, stale source, conflicts, failure, retry: no omission, duplication, overwrite or regrant | met except cleanup recovery (see finding) | Stale owner, A6 new child, A7 resolver change: refused, nothing written. B1 occupied slot: fails closed, unrelated name unchanged. C1 abandoned pending batch: reconciled, exactly one batch. C2 on-chain revert: nothing written, retry completes. C5: not offered again. Regrant refusal: PR unit tests only (grants share the atomic batch) |
| Source-consistency policy and rollout decision | not met (process) | Signing/inclusion window is disclosed, not resolved |
| Independent review and human QA | not met (process) | |

**WEB-1933 (block and guard)**

| Criterion | Status | Evidence |
|---|---|---|
| Unsupported names visible with specific reason and next step | met | Flag off, deeper tree, incomplete inventory, A1 unsupported parent, A2 wrapped protections (fuses forged; the NameWrapper refuses the real shape), A3 too large, A4 unknown label; docs link; desktop and phone |
| Acknowledgement cannot make a blocked case eligible | met | No acknowledgement control; blocked rows stay unselected; controls upgrade, blocked parents stay RESERVED |
| Same boundary at selection, preparation, recovery, execution; flags and stale UI cannot authorize an import | met | Rollout gate test (live flag withdrawal); stale-source tests; PR unit tests for the submit-time and recovery checks |
| Complete reviewed plan required; unsupported descendants block the tree | met | A5: a 150-child family is refused whole at preparation, nothing written; A6 |
| Recovery reconciles receipts and cleans up temporary approvals without rerunning migration | **partly met** | C1 reconciles a pending batch without resubmitting. **C3b fails**: an interrupted recreation run at the cleanup prompt offers no "Finish upgrade" (flag on or off) and the HCA keeps its ETHRegistry approval. C3a: same for a plain kept-manager run; the next upgrade revokes it |
| Browser QA desktop and mobile, allowed and blocked cases | met (automated) | All of the above; human real-wallet pass still pending |

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
- Environment: Anvil fork at 11983209 via Tenderly; fresh-state reads took 4–30 s at times, so fixture sends sometimes hit viem's timeout and needed a retry. The manager ran against a local PostHog stub (`migration` on) once edge.ens.domains stopped answering; client flags were forced by the tests as before. `/upgrade`'s server-side
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
| Medium | `b0480bcc8` gates the legacy-registry fallback only in `getNameResolverAddress`. `getProfile` (`apps/portal/src/features/profile/hooks/useProfile.ts`, from #1502), which feeds `/$name/records`, still falls back to the V1 registry resolver whenever no V2 resolver answers. A recreated child with no resolver on its V2 path (its own and its parent's cleared) shows its stale V1 records there, even though the resolver lookup `b0480bcc8` gated returns none for it. Test 11 stage 2. Fix: apply the same `resolveV2EthOwner` gate before the `getProfile` fallback |
| Low, UX | After `Graveyard.clear()`, a recreated child's holder sees "Permission Denied" on edit-records, though they hold token `ALL` and could repoint the resolver; the message does not say so |
| Medium | Cleanup-only recovery is missing after an interrupted run. When the user leaves at the "Remove temporary access" prompt, the journal keeps the submitted batch but no recovery snapshot, so the return visit shows no "Finish upgrade" (flag on or off) and the HCA keeps `setApprovalForAll` on the V2 ETHRegistry over all the owner's names until the next upgrade revokes it. The service comment intends to keep "its pre-batch recovery snapshot until temporary HCA access is revoked" for copy trees; `useMigrationRecoverySnapshot` discarding a snapshot that has no recorded attempt yet is a likely cause (unconfirmed). Tests C3a, C3b (`test.fail`) |
| Note | A recreated child cannot be moved with `safeTransferFrom` while the parent keeps root roles (`TransferUnsafeUntilRegistryIsEmancipated`, 0x54838f98); `unsafeTransfer` works for the holder. Matches the protocol design and #1391 |
| Unconfirmed | While the fee is estimating, the selection step lists only the parent, not the subnames being recreated (some held by other wallets). Not checked after the estimate finished |
| Not covered | A nonzero-fuse wrapped child is covered only with forged fuses (the NameWrapper refuses the real shape); rejecting the final `setResolver` in the wallet (the headless wallet's reject is retried as transient) |
