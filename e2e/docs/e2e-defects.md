# E2E Defect Register

Index of defects found by the E2E suite. Governed by
[`e2e-goal.md`](./e2e-goal.md) — see that doc for the required fields, severity
definitions, and the triage rule.

Detail lives in the linked GitHub issue; this table is the traceability index
from plan scenario → defect → fix.

Severity: **S1** data loss / funds at risk / irreversible wrong on-chain write ·
**S2** core flow blocked, no workaround · **S3** wrong state shown, workaround
exists · **S4** cosmetic or copy.

Status: `open` → `triaged` → `fixed` → `verified` (verified = the test passes
with its original, unweakened assertion).

| ID | Scenario | App | Sev | Summary | Expected (oracle) | Repro | Issue | Status |
|---|---|---|---|---|---|---|---|---|
| E2E-016 | VK20, VK21, VK22, VK28, VK31, VK42, VK43, VK45 | portal | S3 | The Token tab tells the owner of a **registry-only V1 subname** that their name is an **ERC-721 on the BaseRegistrar**, and shows a token id for it. It is neither. A subname held directly in the legacy registry has no token of any kind — the BaseRegistrar only ever holds `.eth` 2LDs — and the id shown is `labelhash(leaf label)`: for `l1.v1m-20-….eth` the page printed `14348782382986100785356643067205758148600308114560913711117973050161833687690`, which is exactly `cast keccak l1`. Measured on the fork: `BaseRegistrar.ownerOf` on that id **reverts** (no such token), and `nameExpires` returns 0. The id is not meaningless, though — it lives in the **2LD namespace**, so it is the token id `l1.eth` would have. Register that 2LD and the subname’s Token tab starts pointing at a stranger’s NFT, with a contract address and id a holder could act on in an explorer or a marketplace. Source: `routes/$name/token.tsx` picks ERC-721 vs ERC-1155 purely on `getWrapperData` being null, then computes `labelhash(name.split('.')[0])`, which is only correct for a 2LD. A wrapped subname is handled correctly (ERC-1155, NameWrapper, namehash). Found by the V1 shape matrix (2026-09-14). | A registry-only subname has no token: the tab says so, rather than naming a contract and id that belong to another name | `pnpm e2e:portal --project=portal-v1-matrix --grep "@scenario:VK20"` — seeds a registry subname and asserts the tab does not name the BaseRegistrar. Marked `test.fail()` | _pending_ | open |
| E2E-017 | VD20, VA20, VD21, VA21, VD22, VA22, VD23, VA23, VD24, VA24, VD25, VA25, VD26, VA26, VD27, VA27, VD28, VA28, VD29, VA29, VD30, VA30, VD31, VA31, VD40, VA40, VD41, VA41, VD42, VA42, VD43, VA43, VD45, VA45 | portal | S3 | Records set on a **V1 subname** are invisible in the portal: `/{name}/records` says **“No records set”** and `/{name}/address` shows an empty Mainnet row, while the resolver the subname’s own registry slot points at holds both. The identical records on a V1 **2LD** render correctly, which is what makes this a depth bug rather than a V1 bug. It does **not** depend on the subname's wrap class: reproduced on a merely-wrapped child, an emancipated one, a locked one and a registry-only one, at both 3LD and 4LD. (An earlier run appeared to show the PCC-burnt classes rendering correctly; that was a fixture deriving subname expiry from the runner's wall clock rather than the chain's — fixed, and guarded by harness case `HW12`.) Measured on the fork (2026-09-14) for `l1.v1m-23-….eth`: `ENSRegistry.resolver(namehash(leaf))` = `0x8FADE66B…`; that resolver returns `text(node,'com.twitter')` = `@v1m-23` and `addr(node,60)` = `0x3C44Cd…`; the page renders neither. The 2LD one level up, seeded the same way in the same run, renders both. **Where it comes from.** `useProfile.getProfile` reads values with ensjs `getRecords`, which goes through `UniversalResolver.resolve`. `findResolver` on the subname returns the right resolver address but at **offset 3** — i.e. matched at the *parent*, not at the subname’s own slot — so the read is an ENSIP-10 wildcard call, which the V1 PublicResolver does not implement, and nothing comes back. `findResolver` on the 2LD returns offset 0. This is the same trap the transfer flow already fixed for itself: `features/transfer/queries/getOwnResolver.ts` exists precisely because `getResolver` via the UniversalResolver “returns the resolver a name *effectively* resolves through, walking up to an ancestor when the name has none of its own”, and its regression test (`useTransferDetachTargets.test.ts:117`) pins the subname case. The profile/records path has no equivalent. **Caveat for whoever picks this up:** the offset-3 result was measured against the fork’s UniversalResolver. Confirm the same `findResolver` offset for a V1 subname on real Sepolia before concluding the fix is app-side — if the fork’s UR pairing differs, the finding is environmental. Found by the V1 shape matrix (2026-09-14). | A V1 subname's records and ETH address render from the resolver on its own registry slot, exactly as a V1 2LD's do | `pnpm e2e:portal --project=portal-v1-matrix --grep "@scenario:VD23"` — seeds a wrapped V1 subname with `com.twitter` and `addr(60)`, then asserts the page shows the resolver's values. Marked `test.fail()` | _pending_ | open |
| E2E-015 | VO7, VO24 | portal | S4 | For a **wrapped** V1 2LD the Ownership tab renders a **Manager** row containing the **NameWrapper contract address** (`0x0635…FcE8`). Nobody holds that address: a wrapped name has one holder, the wrapper owner, and the legacy registry slot is the wrapper itself by construction. The row presents a contract as though it were an account a user could act as, on the page people read to find out who controls a name. ens-app-v3 — the app that owns V1 — deliberately renders no manager row for these names: `src/hooks/ownership/useRoles/utils/getRoles.ts:31-36` returns `owner` + `eth-record` for `eth-emancipated-2ld` and `eth-locked-2ld`, while the unwrapped 2LD arm above it does return a `manager`. Found by the V1 shape matrix (2026-09-13); measured on both wrapped shapes (emancipated and locked), and absent from the unwrapped ones, so it tracks wrap state rather than the viewer. | A wrapped 2LD shows no Manager row; the wrapper owner is the Owner and there is no second role to name | `pnpm e2e:portal --project=portal-v1-matrix --grep "@scenario:VO7"` — seeds a locked 2LD and asserts the Manager row is absent. Marked `test.fail()` | _pending_ | open |
| E2E-014 | F39, VT32 | portal | S3 | Introduced by #1144. While a **wrapped** `.eth` 2LD is in its grace period, its owner opening a subname they don't hold is told **"Not authorized — Only the current owner, or the owner of *2LD*, can move it"** — they are that owner. #1144's `ancestor-grace` card ("*2LD* is in its grace period", with a *Go to 2LD* renew button) never renders. Root cause: in grace the registrar's `ownerOf` reverts, and ensjs `getOwner` (`dist/actions/public/v1/registry/getOwner.js:118-124`) then returns `{ registrant: null, owner: registryOwner, ownershipLevel: 'registrar' }` — and a wrapped 2LD's registry owner is the **NameWrapper contract**. `deriveParent`'s registrar arm reads that as an *unwrapped* parent held by the NameWrapper, so `gateAsParent` finds no match and falls to `not-owner`. The NameWrapper itself still reports the wallet as owner (asserted as a precondition). The PR's unit tests feed `getV1TransferGate` a hand-built parent state, so they never see the ensjs shape. | The 2LD's owner gets the `ancestor-grace` card and the renew link, not "Not authorized" | `pnpm e2e:portal --grep "E2E-014"` | — | **fixed** |

**E2E-014 — CLOSED.** fixed 2026-09-17 by #1157, which shows the grace-period card to the owner of a wrapped parent in grace. Both witnesses flipped to "expected to fail, but passed": F39 and the matrix cell VT32.

| E2E-013 | F35 | portal | S4 | Introduced by #1144. When the parent's owner opens an **emancipated** V1 subname's transfer route, the refusal card ends *"Once it expires you can issue it again from the Subnames page."* For a V1 parent that page has no Create button (`canCreateSubname` is only wired for ENSv2, `routes/$name/subnames.tsx`) and `/create-subname` answers *"This feature is only available for ENSv2 names."* — the portal creates subnames on V2 names only, so the real path is to MIGRATE the parent first (and the portal has no migrate CTA; migration lives in the manager app) or to use ens-app-v3, which does create V1 subnames. The card names neither The card also ignores `CANNOT_CREATE_SUBDOMAIN` on the parent — `getV1ParentPowers` correctly drops the re-issue power when it is burned, but this card still promises it. Copy verified absent on `origin/main`, present on `pr-1144`. | The card's way out can be followed: either the Subnames page lets a V1 parent issue the subname, or the copy stops pointing there (and says nothing about re-issuing when `CANNOT_CREATE_SUBDOMAIN` is burned) | `pnpm e2e:portal --grep "E2E-013"` | — | **fixed** |

**E2E-013 — CLOSED.** fixed 2026-09-17 by #1165, which stopped pointing the emancipated-subname card at the read-only Subnames page and sends the parent to the ENS Manager instead. Verified by F35, rewritten to assert the Subnames page is NOT named and the ENS Manager route is.

| E2E-012 | F37 | portal | S4 | Introduced by #1144. The `registrant-only` refusal (*"Reclaim the parent first"*) tells the parent's registrant to *"Reclaim the manager role on **parent** from its Ownership page, then come back."* The Ownership page has no reclaim control — it offers Transfer, Extend, a read-only manager row (`V1NameManagerRecord`, no actions) and History, and nothing outside `features/transfer` mentions reclaim. `reclaim` only runs as step one of transferring the parent to somebody else. The refusal itself is correct; its instruction is a dead end. Copy verified absent on `origin/main`, present on `pr-1144`. | The page the card names offers the reclaim it tells the user to do, or the card names somewhere that does | `pnpm e2e:portal --grep "E2E-012"` | — | **fixed** |

**E2E-012 — CLOSED.** fixed 2026-09-17 by #1157, which added `ReclaimManagerButton` to the Ownership page — the control the card had been naming without it existing. Verified by F37, rewritten to assert the card names a control that is actually offered.

**E2E-011 — CLOSED, backported ahead of merge.** [#1151](https://github.com/ensdomains/apps-monorepo/pull/1151)
("Show the registrant, not the controller, as owner of an unwrapped V1 name")
adds `NameOwnerRow`/`V1OwnerRow` so the Owner row reads the registrant via
`resolveEnsOwner` instead of the flattened controller. Verified on
`test/verify-pr-1151-e2e-011` (branched from `e2e-tests-coverage`, merging in
PR #1151's head): all five witnesses — F33, and matrix cells VV2/VO2/VV3/VO3 —
flipped from "expected to fail, but passed" (with `test.fail()` still in
place) to genuine passes once `test.fail()` was removed (`transfer.spec.ts`)
and the `defect` blocks dropped from `e2e/matrix/expectations.ts`
(regenerated via `matrix:generate`/`matrix:docs`). That branch, including
PR #1151's source changes, was then fast-forward-merged into
`e2e-tests-coverage` directly rather than waiting for #1151 to land on
`main` — **#1151 was still open (unmerged) at the time of this merge.** All
five scenarios were re-run on `e2e-tests-coverage` post-merge and pass. When
#1151 merges to `main` and a later `main` sync lands on this branch, the
merge should be a no-op for these files (identical content); if it isn't,
that's worth a second look.

| E2E-011 | F33, VO2, VV2, VO3, VV3 | portal | S3 | The `/{name}/ownership` tab reports the **controller** as a V1 name's owner, and never shows the **registrant**. For an unwrapped V1 2LD the registrant holds the ERC-721 on `BaseRegistrar` and is the only account the registrar will let transfer the name; the controller is the `ENSRegistry` owner and may only write records. With the two in different hands the tab prints the controller's address in **both** the Owner and the Manager row, so whoever actually owns the name is absent from the page and a non-owner is labelled "Owner". Measured: chain registrant `0x7099…79C8`, controller `0xf39F…2266`, page "Owner 0xf39F…2266 · Manager 0xf39F…2266". The data is plainly reachable — the transfer route resolves the same name correctly and names the registrant (F24, `manager-only`). **Verified pre-existing, not asserted**: F33 was run against a checkout WITHOUT #1134 (`e2e-tests-coverage`, whose portal has no `features/transfer/v1/`) and reproduces there identically — the `test.fail()` is satisfied on both branches. #1134's only change to `ownership/index.tsx` swaps `useCanTransferName` for `useCanTransfer`, which gates the Transfer *button*; the Owner and Manager rows read from `useEnsOwner` and are untouched. Surfaced by testing #1134 because `manager-only` is one of the six states that PR adds handling for, and this is the page you reach it from. S3: wrong state shown, no write is affected, and the transfer route is unaffected. **Second surface, found by the V1 shape matrix (2026-09-13):** `/{name}` (the overview tab) renders the same flattened `ownerQuery.data.owner`, so the Owner row there is wrong in exactly the same way — one root cause in `resolveEnsOwner`, two pages. Cells VO2 and VV2 witness it; VO1/VV1 are the control, where registrant and controller are the same wallet and both rows are right. | The Ownership tab must name the **registrant** as the owner of a V1 name. Its Manager row may show the controller; its Owner row may not | `pnpm e2e:portal --grep "@scenario:F33"` (`transfer.spec.ts`) and `pnpm e2e:portal --project=portal-v1-matrix --grep "@scenario:VV2 \|@scenario:VO2 \|@scenario:VV3 \|@scenario:VO3 "` | [#1151](https://github.com/ensdomains/apps-monorepo/pull/1151) | **verified** |
| E2E-010 | F20 | portal | S3 | `useTransferName`'s `set-eth-addr` step re-reads the name's **own** resolver at execution time specifically to catch the state changing under it — `queryClient.fetchQuery(getOwnResolverQueryOptions(...))`, then `throw new Error('${name} has no resolver of its own to update')`. The guard cannot fire. `apps/portal/src/utils/queryClient.ts` sets a global `staleTime: 1000 * 60 * 60`, so `fetchQuery` returns the value cached when the form rendered and never re-reads the chain. Its own comment — "a null here means the state changed underneath us; fail before touching the chain" — describes behaviour the app does not have: the step proceeds and writes `addr(60)` to whichever resolver was cached. Introduced with `getOwnResolver` in #1120, though the stale-cache interaction is the root cause rather than anything specific to subnames. **Scope**: harmless when the name's own resolver and its parent's are the same contract (the name inherits its way back to the resolver that was written), which is the shape the repro uses. It bites when they differ — the ordinary case, and the one `getOwnResolver` was added to distinguish — because the record then lands on a contract the name no longer references while the flow reports success. S3 not S2: the transfer itself still completes and nothing is destroyed; a records write is silently sent to the wrong place | `set-eth-addr` must not report success when the name has no resolver of its own by the time the step executes — either the guard fires and the user is told, or the step is skipped, but it must not write to a stale resolver and log `state: success` | `pnpm e2e:portal --grep "E2E-010"` (`transfer.spec.ts`, "writes the ETH address to a resolver the name no longer points at"). Deterministic: seeds a subname with its own resolver and an `addr(60)`, turns the resolver detach OFF so `set-eth-addr` enters the plan, clears the own resolver on-chain after the form has read it, then drives the flow with the shared helper — which returns only once the step has genuinely reported success | _pending_ | open |
| E2E-009 | C1 | portal | S3 | **FIXED upstream by #1131, #1133, #1137.** Was: the "parent registry / roles" panel read role holders by replaying the newest `MAX_EVENTS` (hardcoded `1000`) `EACRolesChanged` events for the **whole `.eth` registry** (`events(contractAddress:, first: 1000, orderBy: blockNumber desc)`), then filtering to the name's own `resource` client-side. There is one such event per registration/grant and the live registry has ~170k of them, so the window covered only the newest ~3 days — a grant older than that never reached the filter step. The GraphQL call **succeeded** with a real (just incomplete) result, so the on-chain-log-scan fallback never fired; it only triggered on a hard error. Same class as the fixed "Panoptes indexed a stale contract set" blocker below (success-with-no-rows trusted as a confident empty state), but a distinct root cause: the query was fixed-size and unscoped, so it reproduced even on a fully healthy, fully synced indexer. The fix moves every role query onto one resource-scoped indexed-log helper (`apps/portal/src/lib/roles/roleChangeLogs.ts`), so registry-wide traffic is now irrelevant by construction; `useRegistryRoles.ts` was deleted and the three sibling hooks that shared the identical `first: 1000` shape (`useRegistryRoleHistoryForAccount.ts`, `useRoleHistory.ts`, and the root-holder query) all read through it now | A role holder must not disappear from the panel merely because >=1000 *other* `EACRolesChanged` events landed on the registry after their own grant — the panel must not render "No role holders yet" (indistinguishable from C7/C8's genuine empty state) for an account that `assertRoleBitmap` shows still holds roles on-chain | `pnpm e2e:portal --grep "@scenario:C1"` (`roles.spec.ts`, "keeps listing a role holder after 1000 newer events land on the registry"). The test was inverted in place rather than deleted: it still floods the registry with >1000 newer events on an unrelated resource, still asserts the flood genuinely pushed the target out of a newest-1000 registry-wide window (now a precondition, so a silently-failed flood cannot make it pass vacuously), and then asserts the holder **survives** — which is what a revert to a registry-wide window would break | [#1131](https://github.com/ensdomains/apps-monorepo/pull/1131), [#1133](https://github.com/ensdomains/apps-monorepo/pull/1133), [#1137](https://github.com/ensdomains/apps-monorepo/pull/1137) | fixed |
| E2E-008 | E1 | portal | S3 | The indexer's `resolver.texts` (and presumably `.addresses`) field appears keyed by resolver **contract address alone**, not by `(address, node)`. Once two different names point their resolver slot at the same already-deployed resolver contract (`setResolver` — the resolver-level analogue of E2E-007's shared-registry pattern), each name's indexed text-key list bleeds into the other's, even though on-chain each node's records stay correctly scoped (verified directly: `text(nodeB, key)` reads empty on-chain while `domains(where:{name:B}).resolver.texts` reports the key). Confirmed deterministic once the indexer-sync race is handled (poll the writer's own domain until the new key appears before asserting on the other name) — an immediate, unwaited check on the reader can pass for the wrong reason | The indexer's `resolver.texts` for a name must reflect only keys ever written to *that name's own node*, never keys written to a different name that happens to share the same resolver contract | `pnpm e2e:portal --grep "shared by two names"` (`records.spec.ts`) | _pending_ | open |
| E2E-007 | D9 | portal | S3 | A subname registered from a name's own `/subnames` page is misattributed to a *different* parent name, if that other name also points its subregistry at the same already-deployed registry contract (via "use a pre-existing registry contract" in `SubregistryConfigurator.tsx`). The indexer doesn't just misattribute the parent relation — it names the child domain entity using whichever name **currently** "owns" the shared registry pointer at index time (e.g. the entity is literally called `purple.kangaroo.eth`, never `purple.koala.eth`, even though `purple` was registered from `koala.eth`'s own `/create-subname` page): a single mutable registry → parent-name pointer, updated on `setSubregistry`, stamped onto every subsequent registration event from that registry regardless of which name's UI actually created it. Confirmed both when one wallet owns both names and when they are owned by two separate wallets (the latter needs an explicit `ROLE_REGISTRAR` grant to the second owner first, matching the Slack report). Mirror evidence also confirmed: the subname registered *before* the registry was shared stays correctly attributed to the original owner, and the second name's page shows both its own subname AND the misattributed one | A subname created from `koala.eth`'s own `/subnames` page must appear on `koala.eth`'s `/subnames` page, regardless of whether another name (`kangaroo.eth`) also uses `koala.eth`'s registry as its own subregistry | `pnpm e2e:portal --grep "subnames registered under a shared registry"` (`subnames.spec.ts` — two variants: same-owner and separate-owners) | _pending_ | open |
| E2E-006 | MD5 | metadata | S3 | `POST /webhook` never purges the L0 edge cache (`caches.default`) for the unified metadata JSON route (`/:network/:registryType/:name`) — a changed record can stay stale there for up to `EDGE_CACHE_MAX_AGE_SECS` (300s) after a successful, accepted webhook call | `handleMetadata` (`src/index.ts`) puts every metadata JSON response into the L0 edge cache via `edgeCachePut`. `handleWebhook`'s purge loop only deletes `{registry,namewrapper}/{name}/{image,rasterize}` L0 keys (its own comment: "L0 only caches images/rasterize... metadata/migration-status carry their own short TTLs" — incorrect once `handleMetadata`'s `edgeCachePut` call is accounted for). The underlying KV (L1) cache IS correctly invalidated — confirmed by re-requesting the same name+registryType with a cache-busting query param (a different L0 key, unaffected by the gap, same KV key) and observing a fresh `last_request_date`. S3 not S2: a workaround exists (wait out the 5-minute L0 TTL, or vary the URL), and no other route is affected | Same exact URL, requested twice with no other change in between, after a real webhook call, should not return byte-identical `last_request_date` | `pnpm e2e:metadata --grep "@scenario:MD5"` (`cache-invalidation.spec.ts`, "does not purge the L0 edge cache") | _pending_ | open |
| E2E-005 | MD6 | metadata | S2 | `GET /registry-hierarchy/:name` 500s unconditionally — every name, every network, every state (registered, unregistered, migrated, unmigrated, native) | `MetadataService.getRegistryHierarchy` (`src/services/metadata.ts`) → `CacheService.set` calls `KV.put` with `expiration_ttl: 30` for the hierarchy cache preset, but Cloudflare KV enforces a hard minimum of 60s (`400 Invalid expiration_ttl of 30. Expiration TTL must be at least 60.`) — the write throws, is not caught, and the whole request 500s instead of just skipping the cache (or 404ing, for an unregistered name — it never reaches the not-found check). Every other cached route uses a >=60s TTL and is unaffected (confirmed: `/migration-status` succeeds against the same names). Reproduced live against a mainnet name, a migrated sepolia name, and a never-registered sepolia name — identical stack trace all three times | 200 with the hierarchy JSON for a registered name (mirroring `/migration-status`), 404 for an unregistered one | `pnpm e2e:metadata --grep "@scenario:MD6"` (`dispatch-and-errors.spec.ts`, "registry-hierarchy") | _pending_ | open |
| E2E-004 | ~~G* (all)~~ — **WITHDRAWN, not a real defect** | manager | — | ~~The dashboard's migration-eligibility query never settles~~ — misdiagnosed. The actual cause of the "Upgrade Names" flake was local test setup: `e2e/.env` had `E2E_MOCK_INDEXER=false`, so the browser hit the real local Panoptes indexer (`getMigratedNamesCount`, which also gates the banner) instead of the mock, and Panoptes in this session had known drift/health issues. With `E2E_MOCK_INDEXER=true` (matching `.env.ci`), the button appeared reliably across 8+ consecutive runs with zero failures. The render-level instrumentation that produced the original "isPending never settles" evidence was real but was observing symptoms of the unmocked, unhealthy indexer call, not an app query-key bug. Left as a row (rather than deleted) so nobody re-diagnoses the same wrong root cause | — | — | withdrawn |
| E2E-003 | F14 | portal | S2 | Retrying a transfer step whose wallet prompt was previously rejected deterministically fails — "Failed to submit transaction: An unknown RPC error occurred", every run, not intermittent | Clicking "Retry" on a step the user previously cancelled should resubmit and succeed like a first attempt; instead the resubmission itself fails at the RPC layer. Reproduced with `wallet.reject(Web3RequestKind.SendTransaction)` on the second of two transfer steps, then clicking Retry and authorizing — see the test for the exact repro. Not chased to a Solidity/viem root cause; `transaction.machine.ts`'s own "nonce too low" guard comment (submitting state, onError) is the most likely lead, since both steps share one signer and a resubmitted step reuses `context.request` rather than re-preparing it. Not S1: step 1's effect (resolver detached) is real and durable, and does not corrupt anything — the user is only stuck on this one retry, not left in a broken on-chain state | `pnpm e2e:portal --grep "shows what already executed and lets the user resume after a rejected step"` | _pending_ | open |
| E2E-002 | F5 | portal | S1 | Transfer to a non-receiver contract detaches the resolver irreversibly, then hangs — token never moves, no error shown | `buildTransferPlan` must not execute `detach-resolver` before a `transfer-token` that cannot succeed; `test_safeTransferFrom_invalidReceiver` must surface as an error, not a stall (plan §5.F F5, and the S1 rule in e2e-goal.md) | `pnpm e2e:portal --grep "@scenario:F5"` | _pending_ | open |
| E2E-001 | F1 | portal | S1 | Migrated locked V1 name offered a `detach-registry` step its owner cannot execute — `detach-resolver` had already run irreversibly | Owner lacks `ROLE_SET_SUBREGISTRY` on the locked name's `WrapperRegistry`, so `buildTransferPlan` must not offer the step. Measured in [`transfer-web446-test-plan.md`](./transfer-web446-test-plan.md) §2 finding F1 | `pnpm e2e:portal --grep "without offering the registry detach it cannot perform"` | _pending_ | fixed |

### E2E-009's evidence, and why it still says `fixed` rather than `verified`

The regression test has been observed green **three times** (4.1m, 3.7m, and a
third run) against a fully synced Panoptes, and — the check that matters — it
**fails** against a tree without the fix. Two failures along the way were both
environmental and both are accounted for: the 30s assertion timeout it
inherited (see SUB-F1 in the WEB-128 plan; the panel now takes ~29s on a local
fork) and one transient `waitForIndexedRoles` miss while Panoptes was still
chewing through the flood's own events.

It is not marked `verified` because this register reserves that for a run
recorded by `pnpm e2e:coverage --results`, and **there is currently no way to
produce that file locally**: `playwright.config.base.ts` pins
`reporter: process.env.CI ? 'github' : 'list'`, and passing `--reporter=json`
(with or without `PLAYWRIGHT_JSON_OUTPUT_NAME`) does not displace it — the run
still emits the list reporter and writes no file. `coverage/reconcile.ts` only
uses `--reporter=json` together with `--list`, which is enumeration, not
results. Worth fixing separately; until then `verified` is unreachable by the
documented route for any defect, not just this one.

Status legend for the row above: **fixed** = the code fix landed
(`f524d71b3`, `dab56ec16` — role validation in `useTransferDetachTargets`) and
the regression test is committed (`ff2d85b30`), but this register will not say
`verified` until that test is observed green in a run recorded by
`pnpm e2e:coverage --results`.

### E2E-007 is a display bug, not a protocol violation — scope confirmed on-chain

A natural follow-up to E2E-007: once two names share a registry, is it even
*valid* for the second name's subname path to resolve at all (e.g. `1.def`,
never registered from `def.eth`'s own page)? Confirmed directly on-chain
(`subnames.spec.ts`, "a shared registry resolves every label identically
under every linked parent name, on-chain") — **yes, by protocol design**:

- `PermissionedRegistry` stores owner / resolver / subregistry / expiry per
  **label** (via its canonical id) with no notion of "which parent name I
  belong to" anywhere in its state.
- Once two 2LDs both point their subregistry slot at the same registry
  contract, every label in it resolves identically (same owner, via ensjs's
  `getOwner` — the same call the app itself uses) through **either** parent's
  namespace, regardless of which parent's UI registered it and regardless of
  order relative to the sharing. Verified for all three shapes: a label that
  predates the sharing, one registered by the original owner afterward, and
  one registered by the new linker.
- So E2E-007's defect is precisely scoped: it is not that cross-resolution
  happens at all (that's correct, intentional protocol behavior — there is no
  "real" parent at the contract level, both are simultaneously valid) — it is
  that the **indexer** behaves as if there is exactly one true parent and
  silently, mutably picks the wrong one, then renders only that one choice.
- Records do **not** share this symmetry, even though ownership does: a
  resolver's text/addr storage is keyed by **node** (`namehash` of the full
  dotted name), which differs between `1.abc` and `1.def` even when they
  share the same resolver contract (resolver assignment, like ownership, is
  per-label registry state — also symmetric). E2E-008 is the reverse-shaped
  bug this creates: the indexer's `resolver.texts` conflates two nodes' keys
  even though the resolver contract's own storage keeps them correctly
  isolated.

---

## Product gaps

Not defects and not environment blockers — the app simply does not offer an
affordance the catalogue describes. Per `e2e-build-goal.md` §10, this is a
finding against the product, not test debt, and is tracked here so it is not
silently forgotten. `scenarios.ts` has no dedicated machine-terminal state for
this disposition yet (only `exempt`, which means something different — a
human-approved decision not to test — not "the app can't do this"); until that
schema gap is closed, these rows stay `not-started` in the ratchet and this
table is the durable record.

| Scenario | App | Summary | What's missing | Investigated |
|---|---|---|---|---|
| F6 | portal | Batch transfer (multiple names), incl. one-error-aborts-all `safeBatchTransferFrom` semantics | The names dashboard (`routes/addr/$addr/names.tsx`) has real multi-select row checkboxes, but the only bulk action wired to the selection is **Extend** (renewal). There is no batch-transfer button, route, or modal, and a repo-wide search of `apps/portal/src` for `safeBatchTransferFrom`/`batchTransfer` returns zero hits — the frontend never calls that entrypoint. `SendNameForm.tsx` (the only transfer UI) takes exactly one `name` prop. | 2026-08-29 |

---

## Environment blockers

Not defects — the app behaves as designed — but they stop scenarios reaching a
terminal state, so they are tracked here until fixed.

### A chain-snapshot revert permanently breaks Panoptes for every later run

`withChainSnapshot` (`fixtures/chain-snapshot.ts`) wraps a test in
`evm_snapshot` / `evm_revert` so a forward time-warp cannot leak into later
tests. It works for the chain. It does **not** work for the indexer, and the
indexer does not recover on its own.

Measured 2026-09-10. After runs of `transfer.spec.ts` — whose F4 expired-name
case is the suite's only `withChainSnapshot` user (`transfer.spec.ts:1429`) —
Panoptes was left in a permanent failure loop:

```
warning: Failed to fetch block 11674476 for reorg check: error.BlockNotFound
error: v2 indexing error: error.BlockNotFound
```

644 consecutive occurrences over more than an hour, indexing halted the whole
time. The chain head was **11672575** while Panoptes had already recorded
events at **11674476** — 1901 blocks that no longer existed, because the revert
rewound past them. Its reorg check asks for a block the chain cannot produce,
fails, and never advances again.

Consequence, and it is not subtle: **every indexer-backed assertion fails from
that point until the volume is wiped.** A full-suite run started afterwards
looks like a broad regression — E10, E11 and the C-series role tests all went
red together — when nothing is wrong with the app or the tests.

Within a *single* clean run this mostly hides, because `transfer.spec.ts` sorts
last in the portal project and the revert happens after everything else. That
is alphabetical luck, not isolation. Rename a spec, or run `transfer.spec.ts`
on its own first (which is exactly what one does while iterating), and the next
run is compromised.

**Recovery** — a restart is not enough, since the offending row is in the
volume:

```bash
docker compose -f e2e/infra/docker-compose.yml stop panoptes-indexer panoptes-api
docker compose -f e2e/infra/docker-compose.yml rm -f panoptes-indexer panoptes-api
docker volume rm infra_panoptes-data
docker compose -f e2e/infra/docker-compose.yml up -d panoptes-indexer panoptes-api
```

Then wait out a full resync — ~250k blocks, slow because the same 20k
`eth_getLogs` cap documented above forces small chunks.

**One step is inferred rather than observed**: that the revert *caused* the
rewind. The chain going backwards, Panoptes holding events beyond the new head,
and `withChainSnapshot` being the only mechanism in the suite that rewinds the
chain are all directly measured; nobody watched the revert land. A definitive
check is cheap — snapshot, mine, revert, watch the indexer log — and worth
doing before deciding on a fix.

**Fixes worth weighing:** have `withChainSnapshot` reset the indexer after
reverting; stop using it where an indexer-backed test follows; or give the
portal project a fixture that fails fast when Panoptes' newest event is ahead
of the chain head, so this announces itself instead of masquerading as a
regression. The harness already checks Panoptes is *reachable* and *synced* —
it does not check that it is on the same history.

### ~~`V1_PUBLIC_RESOLVER.setAddr` reverts, so no V1 name can hold an addr(60)~~ — FIXED 2026-09-13

Writing any record to a V1 name reverted for the node's registry owner, through
both `makeV1Name({ records })` and ensjs `setRecords`. `setResolver` succeeded;
only the record write failed.

**Cause.** A `PublicResolver`'s `ens` is **immutable**, fixed at construction,
and `isAuthorised(node)` compares `msg.sender` against `ens.owner(node)`. The
pinned `0x640294a2…` is bound to the *superseded* fixture registry, while
iteration 23 repointed the fixture onto the canonical `ensLegacyRegistry`. The
name therefore had no ownership record in the registry the resolver consults,
so every write failed authorisation. The last line of the old entry — "worth
checking whether `V1_PUBLIC_RESOLVER` is the right address" — was the answer.

**How it was settled.** Measured, not reasoned: simulating `setText` with
`eth_call --from` the registry owner of a real Sepolia name (`demo.eth`, owned
by an EOA) against every `KNOWN_PUBLIC_RESOLVERS` entry. `0x640294a2…` reverts;
`0xE99638b4…` and `0x8FADE66B…` pass, and both stay authorised for a **wrapped**
name called by its NameWrapper owner.

**Fix.** `V1_PUBLIC_RESOLVER` → `0x8FADE66B…` in `fixtures/makeV1Name.ts`. It is
a `KNOWN_PUBLIC_RESOLVERS` member, so migration classifies it
`to-owned-permres` rather than silently degrading to `keep-v1` — i.e. the `GR*`
rows exercise the branch they claim. Guarded by harness case **HW11**, which
seeds a wrapped and an unwrapped name with records and reads both back off the
resolver.

**What it unblocks:** the positive `setEthAddress` case in
`getV1DetachTargets` (F29 could previously only assert the option was withheld,
for want of a record rather than want of authority), every `GR*` record-replay
row, and the record cells of the V1 shape matrix.

### `anvil-mainnet` cannot fork, so the whole metadata suite (18 tests) never runs

`docker-compose.yml` defaults `MAINNET_FORK_URL` to
`https://ethereum-rpc.publicnode.com`, which refuses the archive request Anvil
makes on startup:

```
Error: failed to get fork block number
- HTTP error 403: {"message":"Archive requests require a personal token.
   Get one at: https://www.allnodes.com/publicnode"}
```

`anvil-mainnet` therefore exits 1, and `metadata-service` — which depends on it
— never starts, so `pnpm e2e:metadata` cannot run at all. Measured 2026-09-10:
`docker compose up -d metadata-service` fails with
`dependency failed to start: container infra-anvil-mainnet-1 exited (1)`.

Note the asymmetry that hides this: `SEPOLIA_FORK_URL` has a **working** drpc
endpoint baked in as its default, so the portal and manager suites come up on a
bare checkout and nothing signals that the mainnet side did not. The failure is
also silent from the suite's point of view — you get a connection error, not a
"fork unavailable" message.

**Fix:** put an archive-capable endpoint in `e2e/infra/.env` (gitignored;
template at `e2e/infra/.env.example`):

```
MAINNET_FORK_URL=<archive-capable mainnet RPC>
```

Worth considering whether the compose default should be a URL that actually
works, the way the Sepolia one is — or whether it should be absent, so the
failure names itself instead of 403ing.

### The live Sepolia `.eth` registry's own history now exceeds Anvil's `eth_getLogs` cap — blocks C1, C4, C5, C11, C12

`helpers/role-assertions.ts`'s `readRoleHolders` (the on-chain oracle several
roles tests assert against) calls ensjs's `getNameRoleAccounts`, which — like
the app bug E2E-009 was about, before #1131 fixed the app side — replays the
registry's role-grant events from logs, but with no window at all: an unpaginated
`eth_getLogs({ address: ETH_REGISTRY, topics: [EACRolesChanged], fromBlock: 0
})`. That single call now fails outright:

```
InvalidParamsRpcError: query returns too many logs, narrow your filter: 20000
```

Confirmed **not** caused by anything in this repo or this test suite: a
completely fresh `docker compose down && up` (new Anvil container, new fork
from `SEPOLIA_FORK_URL` at whatever the live chain head is right now, empty
Panoptes volume) reproduces it as the *first* thing that runs. Sampling
`eth_getLogs` over the fork's history in 50k-block chunks directly against
Anvil found **17,010+** matching logs even undercounting (one chunk itself
exceeded the 20,000 cap and had to be skipped) — this is the real, deployed
Sepolia `.eth` registry (`0xBDC85dD5…`), and its own organic usage across
however many teams/bots exercise ENS v2 on Sepolia has apparently grown past
the point an unpaginated full-history scan can read in one call. Verified
independent of every local change: `git stash` (reverting to the untouched
`roles.spec.ts`) and re-running C1 alone reproduces the identical error.

This is a **standing, calendar-time-dependent flake**, not a one-off: since
`SEPOLIA_FORK_URL` has no pinned block, every fresh fork inherits however much
history real Sepolia has accumulated *as of whenever the container starts*,
and that number only grows.

**Still reproduces after the merge with main (re-measured 2026-09-09** on a
fresh `down`/`up` with the Panoptes volume wiped, fork head `11668103`**).**
The fix, however, is now known exactly, because the same three PRs that fixed
E2E-009 solved this on the app side. Three variants measured directly against
this fork:

| `eth_getLogs` shape | Result |
|---|---|
| `fromBlock: 0`, unscoped (what ensjs's `getNameRoleAccounts` does today) | **fails** — `query returns too many logs` |
| `fromBlock: 11_383_818` (registry deploy), still unscoped | **fails** — the floor buys nothing, since the registry did not exist before it, so every one of its logs is inside the range anyway |
| `fromBlock: 11_383_818` **+ `args: { resource }`** | **succeeds** |

So the answer is **resource scoping**, not pagination and not pinning
`SEPOLIA_FORK_URL`. Two details make it work, both already solved in
`apps/portal/src/lib/roles/roleChangeLogs.ts` (#1131/#1137) — copy that helper:

- Filter on the **single** `EACRolesChanged` event, not ensjs's `eacRolesEvents`
  array. With several events viem cannot apply the indexed `args` per event, so
  the filter silently widens back to every role event on the registry. ensjs's
  `getNameRoleAccounts` passes the array *and* `args: { resource }`, which is
  why its scoping does not take effect.
- Pair it with a `fromBlock` floor (`ROLES_FROM_BLOCK = 11_383_818n`) so the
  scan does not walk pre-deployment history for nothing.

ensjs's action does accept `fromBlock`/`toBlock`, but not a single-event
filter, so `readRoleHolders` needs its own `getLogs` call rather than an extra
argument. Not done here — it is unrelated to the PR this branch is currently
QA'ing — but it is a small, well-understood change that would unblock five
scenarios.

Does **not** affect E2E-009's regression test: its
on-chain oracle is `readNameRoles`/`assertRoleBitmap` → ensjs's
`getNameRolesForAccount`, a single-account read rather than a full
enumerate-every-holder log replay, and it passed repeatedly against this same
fork. Only the "list every holder" shape of oracle is exposed to this.

### Panoptes indexed a stale contract set — FIXED 2026-08-10

The portal's roles table reads the indexer first
(`features/roles/hooks/useNameRoleAccounts.ts`) and falls back to an on-chain
log scan **only when the GraphQL call errors**. Panoptes was running and synced
to head, but its contract manifest named a superseded `.eth` registry
(`0xdedb9291…`, alongside a stale `public_resolver` / `l2_eth_registrar` and
three zeroed migration controllers), so it skipped every event from the live
registry as an unknown contract. The GraphQL call therefore *succeeded* with
zero rows, the fallback never fired, and the table rendered "No role holders
yet" for names that plainly had holders. C1, C4 and C5 were blocked on it.

Fixed by regenerating `e2e/infra/panoptes/contracts.json` from
`ensL1Contracts[sepolia]` — the same config the apps read, so it cannot drift
from what they talk to — and re-indexing from the V2 deployment block
(`11383818`, found by bisecting `getCode`) rather than `10921984`. C1, C4 and
C5 now pass on two consecutive runs.

Two things worth keeping:

- **The root cause is config drift, and it is plural.** The same superseded
  deployment was hardcoded in `helpers/migration-assertions.ts` (fixed earlier)
  and still is in `e2e/infra/scripts/bake-contracts.py`, which names a *third*
  address again (`0x796fff2e…`). That script only feeds the snapshot-image
  path, currently disabled in CI, so it is out of scope here — but it will bite
  whoever re-enables it.
- **The app's failure mode is silent.** A reachable-but-misconfigured indexer
  returns success-with-no-rows, and the UI presents that as a confident false
  negative about permissions with no cross-check against chain. Plan K2 only
  specifies the indexer being *down*. If the roles table should never claim "no
  holders" without on-chain confirmation, that is a real S3 and needs an
  `E2E-###` row — was filed as **E2E-009**, a different root cause in the same
  failure class: not a misconfigured indexer, but a fixed-size, unscoped event
  window (`MAX_EVENTS = 1000`) that dropped old grants even when the indexer
  was fully healthy and fully synced. Fixed upstream by #1131/#1133/#1137,
  which moved every role query onto a resource-scoped indexed-log read; the
  broader question — whether the roles table should ever claim "no holders"
  without on-chain confirmation — is now narrower but not formally ruled on.

### Indexer lag races indexer-backed assertions

Panoptes polls every 2s, so a test that writes on-chain and immediately loads
an indexer-backed page can beat it. The race fails silently and permanently:
the query succeeds with no rows, the app renders its empty state, and
react-query caches that for the rest of the test.

`helpers/indexer-sync.ts` (`waitForIndexedRoles`) is the precondition. Pass it
**every account the assertion names** — waiting on the resource alone is
satisfied by the owner event that registration itself emits, while a grant made
afterwards may still be unindexed. C1 passed and then failed on the flake-gate
re-run for exactly that reason, before the helper was tightened.

### E9's alias-mode matrix is not reachable through the UI

Plan E9 asks for "the five alias modes: none, root, exact, subdomain,
recursive (`test_alias_*`)". The portal's `create-alias` route exposes no mode
selector at all — the form is two comboboxes, a source name and a target node,
and the mode is whatever the app picks. So four of the five modes cannot be
produced through the UI, and the fifth cannot be distinguished from the others
by anything the page shows.

E9 is therefore left **non-terminal** rather than partially claimed. It needs a
ruling, and the options are genuinely different work:

- **EXEMPT** — the mode matrix belongs to `PermissionedResolver.t.sol` and is
  not a UI concern. Needs a written exemption with an approver.
- **Narrow the scenario** — redefine E9 as "the one mode the UI can create,
  asserted on-chain", which is a real test worth having, and drop the matrix
  from the e2e plan's scope.
- **It is a gap in the app** — if users are meant to be able to choose a mode,
  the UI is missing it, and that is a feature defect rather than a test one.

E10 (alias creation without `ROLE_SET_ALIAS`) is unaffected and passes.

### E12 and E14 are not reachable through the portal

Checked while scoping the §5.E tail; recording so the next session does not
re-derive it.

- **E14 (resolver upgrade)** — there is no upgrade affordance anywhere under
  `routes/resolver/` or `features/resolver/`. `test_upgrade` / `canUpgradeFrom`
  are contract-level only.
- **E12 (multicall partial failure)** — record saves go through
  `multicallWithNodeCheck` (`features/records/helpers/saveRecords.ts`), which
  is atomic: the batch either lands or reverts. There is no partial-success
  state for the UI to surface, so "partial error semantics surfaced, not
  silently swallowed" has nothing to assert against.

Both need the same ruling as E9 — exempt to the contract suite, or redefine.
Left non-terminal rather than claimed.

### Panoptes never populates its `registries` or `resolvers` tables (blocks C13, C14, D10–D14)

Every `/registry/$address/*` page renders "Registry not found". The route reads
`getRegistryInfoQueryOptions` → the indexer's `registry(address:)` field
(`features/registry/hooks/useRegistry.ts`), and that returns `null` for every
address.

Measured 2026-08-10, after the contract-manifest fix:

- `{ registries(first: 5) { address } }` returns `[]` — the table is empty, not
  merely missing one entry
- yet the indexer log shows `Subregistry indexing: … from 47 subregistries` and
  `Backfilled 1 historical events for subregistry 0xc65230bb…`, and names
  inside those registries resolve fine

So Panoptes discovers subregistries and indexes their *events and names*, but
never creates a `registry` entity for any of them — including the `.eth`
registry itself. The sidebar can show a registry (it derives it from name data)
while the page built on `registry(address:)` cannot.

This is not a test problem, and it blocks more than one scenario:

- **C13** (registry-level vs name-level roles are independent) — the on-chain
  half is verified and correct: a grant at a name resource inside a subregistry
  does *not* appear at that registry's root resource. But the registry-level
  table cannot render, so the "two tables are independent" oracle is not
  assertable. Left non-terminal.
- **D10–D14** (registry labels, tree, history, add/edit user sheets, upgrade)
  all live under the same route and will hit this first.

Needs a ruling on whether the gap is in Panoptes' schema coverage or in the
app depending on an entity the indexer does not produce.

**Widened 2026-08-10 (same tick, later):** `resolvers` is empty too. Table by
table on a fully synced indexer:

| table | state |
|---|---|
| `domains` | populated |
| `events` | populated |
| `registries` | **empty** |
| `resolvers` | **empty** |

So the pattern is not one missing table — Panoptes indexes *events and names*
but produces none of the entity records the portal's detail pages are built
on. Anything reading `registry(address:)` or `resolver(id:)` renders
not-found, while anything reading names or replaying events works.

That adds **C14** (resolver per-key roles, `/resolver/$address/roles` →
`getResolverOverviewQueryOptions` → `resolver(id:)`) to the blocked set.

**Correction (2026-09-10) — this also blocks E11, contradicting what this note
used to say.** It previously read "E11 passes on `/resolver/$address/nodes`,
which does not go through that query — so the blocker is per-route". Measured
against a healthy, fully synced indexer on a fresh fork, E11 fails, and for
exactly this reason:

```
on-chain      registry.getResolver(label) -> 0x53363ceF…4497
indexer       domains(where:{name}) { resolver { address } }
              -> 0x53363cef…4497        ✓ present
indexer       resolvers(where:{address:"0x53363cef…4497"})
              -> []                     ✗ EMPTY
```

The `domains` row knows which resolver a name uses, but no `resolvers` **entity**
is ever created for that address — and `/resolver/$address/nodes` reads the
entity, so it renders an empty node list. Panoptes' own log says so directly
while the suite runs: `Resolver indexing: N events processed, 1 skipped
(unknown resolvers)`, on most batches.

**E10 is blocked by the same thing**: `/resolver/$address/nodes` short-circuits
with "This resolver has no nodes" before it evaluates permissions at all, so
the alias-permission assertion never runs.

So the blocked set is **C13, C14, D10–D14, E10, E11**, and the "per-route, not
per-section" framing was wrong — every route that reads a `resolvers` or
`registries` entity is affected, whichever page it lives on.

**Widened again — even a `domains` entity can be permanently missing (2026-09-04):**
found manually, not independently reproducible on demand, so recorded here
rather than as an `E2E-###` row. A subname (`1.haha.eth`) that is genuinely
registered on-chain right now — confirmed via the same `getOwner`/`getNameRegistries`
calls the portal itself uses, non-zero owner, expiry decades out — has **no**
`domains(where:{name:"1.haha.eth"})` entity at all (`[]`), and its parent's own
`subdomains` list doesn't include it either. Two symptoms fall out of this
directly, both indexer-caused, neither the app's fault:
- `RecentHistoryTimeline` (`useNameHistoryTimeline.ts`, queries `domains(where:{name})`)
  renders "No recent activity" for a name with a real registration event.
- `useProfile.ts` discovers which text *keys* to even bother reading from chain
  via `domains(where:{name}).resolver.texts`; with no entity at all, a genuinely
  on-chain-set custom text key (confirmed directly: `text(node, key)` on the
  resolver returns the real value) never gets read, so the Records page shows
  nothing for it — not because the value is missing, but because the app never
  learns the key exists.

Unlike E2E-007/E2E-008 above, no reliable on-demand trigger for the *complete
absence of a domain entity* has been found yet — it may be the same
late-subregistry-discovery gap as `registries`/`resolvers` above, or a
chain/indexer sync-point mismatch from an earlier fork reset. Worth a ruling
once a deterministic repro exists.

### makeV1Name builds names in a V1 deployment the apps do not read (blocks all of §5.G / P3)

`fixtures/makeV1Name.ts` registers through V1 contracts at `0xF42dF26c…` /
`0x64096092…` / `0xc7e033b8…`. The manager's migration code resolves its V1
contracts through ensjs — `features/migration/service/checkHelperApprovals.ts`
calls `getChainContractAddress` for `ensBaseRegistrarImplementation` and
`ensNameWrapper` — which gives `0x57f1887a…` / `0x0635513f…`.

Both deployments are live on the fork and both have code, so registration
succeeds and nothing errors. The names simply land in a registrar the app never
looks at. **Every V1 name the suite creates is invisible to the app under
test.** That is the root reason the §5.G migration matrix has no working
coverage, and it compounds with the manager project's `testIgnore` excluding
those specs — two independent problems, each of which would hide the other.

Attempted the switch this tick and it is not address-only:

- the two controllers share an ABI and produce **identical** commitment hashes,
  so the encoding is compatible
- but `register` reverts on the ensjs controller ("unknown reason"), so
  something in the flow differs — fee, commitment age, or parameter semantics

Reverted rather than left half-applied: a fixture pointing consistently at the
wrong deployment is easier to reason about than one split across two. The V2
half of the same file *was* fixed and verified (see the reserveInV2 commit).

Next step is to decode that revert against the ensjs controller and adapt the
registration flow. Until then §5.G, HW10 and P3 stay blocked.

---

## E2E-002 detail

Recipient `0xcA11bde05977b3631167028862bE2a173976CA11` (Multicall3) is deployed
but is not an ERC-1155 receiver, so `safeTransferFrom` to it reverts. The
portal's transfer form accepts it with no client-side warning and the "Transfer
name" button stays enabled.

Measured 2026-08-10 on the fork:

- **Step 1, `detach-resolver`: executed and confirmed on-chain.** The resolver
  goes from `0x640294A2b2D87E7f522db3e3E3E876764BCe170D` to
  `0x0000000000000000000000000000000000000000`.
- **Step 2, `transfer-token`: never completes.** The dialog sits on a disabled
  "Waiting…" button indefinitely. No error, no revert reason, no retry.
- **`ownerOf` is unchanged** — the token never moved.

Net effect: a user who mistypes a contract address loses their resolver and
gets no indication anything went wrong. The name stops resolving, and the
transfer they asked for did not happen.

This is the same shape as E2E-001 — an irreversible write ordered ahead of a
step that cannot succeed — but reached through a different door. E2E-001 was
fixed by validating *roles* before offering `detach-registry`; nothing
validates that the *recipient* can receive the token before `detach-resolver`
runs.

Two things would each be sufficient: reject a recipient that is a contract
without ERC-1155 receiver support before the plan starts, or order
`transfer-token` first so the irreversible step only runs once the transfer is
known to succeed.

**Confirmed present on `origin/main` @ c3be87173** (2026-08-10), i.e. after
#926 "Ability to Transfer Ownership V2 names" landed. Verified two ways, since
#926 reworked this exact route:

- *Source*: `buildTransferPlan.ts` still pushes `detach-resolver` before
  `transfer-token`, and `SendNameForm.tsx`'s `hasValidRecipient` checks only
  non-empty / not-self / not-zero-address — nothing tests whether the recipient
  can receive an ERC-1155.
- *Empirically*: main checked out in a worktree, portal built and served from
  it, F5 run against it. Identical result — resolver
  `0x640294A2b2D87E7f522db3e3E3E876764BCe170D` → `0x0000…0000`, token
  unmoved, no error surfaced.

So this is not something the branch introduced and not something main has since
fixed.
