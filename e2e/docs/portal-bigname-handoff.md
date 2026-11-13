# Handoff: portal-on-bigname e2e branch, with #1391 (2026-10-19)

For the session continuing e2e work on `e2e/portal-bigname`, the branch where the
explorer (portal) reads bigname (#1354). Read this before running the portal
suites here or merging the branch anywhere.

## TL;DR

- **Branch** `e2e/portal-bigname`, worktree
  `/Users/sg/ens/apps-monorepo/.claude/worktrees/portal-bigname`. **Local only,
  not pushed.**
- It now carries **#1391** (WEB-1829, merged to `main` as `6e960f2f5`) and its
  e2e tests. A subname in a subregistry whose deployer kept its root roles is
  moved with `unsafeTransfer`, because `safeTransferFrom` reverts `0x54838f98`
  for every name in an unemancipated registry. Test plan:
  [`transfer-unemancipated-web1829-test-plan.md`](./transfer-unemancipated-web1829-test-plan.md).
- The WEB-1829 tests **only run against real local bigname**. With
  Panoptes (`e2e-tests-coverage`) or with `E2E_MOCK_INDEXER=true` (CI), the
  explorer disables "Transfer name" before the code under test runs.
- **12 portal tests fail on this branch regardless of #1391**. They're listed
  below, each confirmed to fail identically on the pre-#1391 build.
- **`main` doesn't merge cleanly** (6 files). #1354 itself is behind its own
  head. Both are #1354's to resolve, not this branch's.

## Commits on `e2e/portal-bigname`

| Commit | What |
|---|---|
| `8b4e14f2b` | merge #1354 (WEB-1605, head `1bb1a14dd`) into `e2e-tests-coverage` |
| `b3f71e157` | explorer transfer tests run when the explorer reads bigname (`E2E_EXPLORER_INDEXER=bigname`) |
| `c55d99d2c` | indexer waits follow bigname when the explorer reads it |
| `f98b604b3` | cherry-pick of #1391's squash `6e960f2f5`. The diff is identical to the reviewed PR commit `93e3362c6` |
| `818c7f405` | WEB-1829 tests (cherry-pick of `87942bfe3` from `test/verify-pr-1391-unemancipated-transfer`) |

`818c7f405` contains:
- a new describe `Portal name transfer — subnames › unemancipated subregistry (WEB-1829, #1391)` with three tests: the ticket repro, an emancipated control, and a non-receiver guard
- F15, F19, F20 and E2E-010 now expect `transfer-token-unsafe`: `attachSubregistry` always produces an unemancipated registry
- `transferTxId` accepts `'transfer-token-unsafe'`
- `PortalFixtures` is exported
- the strand unit test mocks `getIsRegistryEmancipated`

## How to run the portal suites here

Real local bigname, no indexer mocks:

```sh
# stack: anvil + bigname profile must be up (docker ps: infra-bigname-api-1 healthy)
cp apps/portal/.env.ci apps/portal/.env && cp apps/manager/.env.ci apps/manager/.env && cp e2e/.env.ci e2e/.env
for a in portal manager; do echo 'VITE_BIGNAME_API_URL=http://127.0.0.1:5660' > apps/$a/.env.local; done
sed -i '' 's/^E2E_MOCK_INDEXER=true/E2E_MOCK_INDEXER=false\nE2E_EXPLORER_INDEXER=bigname/' e2e/.env
pnpm --filter portal dev; pnpm --filter manager dev     # :3001, :3000
cd e2e && pnpm test:portal tests/transfer.spec.ts --workers=1
```

The worktree's own `apps/*/.env` files hold uncommitted local edits. Back them
up before copying the CI files over them.

## Results (2026-10-19, real local bigname)

- `transfer.spec.ts` subname blocks: all pass. On the pre-#1391 build the
  WEB-1829 repro, F15, F19 and F20 fail on the preflight refusal ("The transfer
  itself would fail").
- Full `transfer.spec.ts`: 67 pass, 11 fail. Portal smoke: 17 pass, 3 fail.
- Unit `apps/portal/src/features/transfer`: 207 pass, 1 expected fail. Portal and e2e typecheck pass.

### Failures that are not #1391

Every one fails with the same error on the pre-#1391 build. Only a seeded
name's timestamp differs.

| Test | Error | Likely cause |
|---|---|---|
| F10 `transfers a name from wallet A to an ENS name owned by wallet B` | expected element never visible | per-name PermissionedResolver lacks `setAddr(bytes32,uint256,bytes)`, so ENS-name recipients don't resolve on the fork (known since #1251); not re-checked here |
| F10 `cannot transfer a name to its own address or its own ENS name` | same | same |
| F11 `lets the new owner edit records after a transfer` | same | same |
| F12/F9 `repoints the ETH address at the recipient when the resolver is kept` | `setAddr` reverted | same |
| F9 `updates the ETH address and detaches the registry when the resolver is kept` | `setAddr` reverted | same |
| F9 `detaches the registry alone when the resolver is explicitly kept` | Transfer name disabled | `mockIndexer` serves Panoptes ops, but the explorer's bigname root-role read isn't mocked: "Couldn't check who else holds permissions" |
| F41 consent flow (`@smoke`) | Transfer name disabled | same |
| F42 `shows "Registry detached"…` (`@smoke`) | Transfer name disabled | same |
| WEB-1484 `an empty indexed history still lists every holder on chain` (`@smoke`, roles.spec) | "the indexer was asked first", 0 calls | mocks the Panoptes `RoleChangeEvents` query, which the explorer no longer sends |
| F8 `leaves a third-party manager role grant untouched by a transfer` | role bitmap mismatch for the grantee | not investigated. Fails the same pre-#1391 |
| F14 `shows what already executed and lets the user resume after a rejected step` | succeeded-tx count 0, expected 1 | not investigated. Fails the same pre-#1391 |
| F5 `surfaces an error when the recipient cannot receive the token` (migrated V1) | expected error not visible | not investigated. Fails the same pre-#1391 |

## Open items

1. **Teach the mock indexer the explorer's bigname root-role read.** This is
   the call `apps/portal/src/lib/roles/rootRoleReads.ts` makes. Without it,
   every V2 transfer test is disabled under `E2E_MOCK_INDEXER=true`, including
   F41/F42 (`@smoke`) and the three WEB-1829 tests. Once it's served, tag the
   WEB-1829 repro `@smoke` and add its row to
   [`smoke-suite.md`](./smoke-suite.md). It took 11.9s in a real-bigname smoke
   run. Re-point or drop the WEB-1484 mock at the same time.
2. **F8, F14, F5:** triage on this branch. Their failures predate #1391.
3. **`main` conflicts** (10 commits ahead, at `6e960f2f5`):
   `.github/workflows/deploy-portal.yml`,
   `apps/portal/scripts/check-network-config.ts` (deleted on main),
   `apps/portal/src/features/history/components/TransactionHeaderRow.tsx`,
   `apps/portal/src/features/history/filterTimeline.ts`,
   `apps/portal/src/features/profile/hooks/useProfile.ts`,
   `apps/portal/vite.config.ts`. #1391 itself is already here, so a later merge
   of main only needs those files resolved.
4. **#1354 has moved on.** This branch has it at `1bb1a14dd`, and the PR head
   is now `98ac0a87b`. Re-merge the newer head before trusting results for the
   current PR.
5. **`e2e-tests-coverage` is 6 commits ahead of this branch.** That's
   `migration-resolver.spec.ts`, coverage and defect docs, and duplicates of
   `b3f71e157`/`c55d99d2c`. Nothing overlaps the transfer files.
6. **Retrofit to `e2e-tests-coverage` waits for #1354.** On that branch the
   explorer reads Panoptes, and the local Panoptes image disables every V2
   transfer, so the WEB-1829 tests would only add red. Land `818c7f405` there
   once #1354 is merged.

## Left running

- No dev servers. The verify worktree (`pr-1391-unemancipated-transfer`) is removed.
- Docker stack (anvil, bigname, panoptes, alto, paymaster, mockestrator) untouched.
- Branches `test/verify-pr-1391-unemancipated-transfer` (its test commit is
  `818c7f405` here) and `pr-1391-head` still exist locally. They're safe to delete.
