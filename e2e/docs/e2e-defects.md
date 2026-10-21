# E2E Defect Register

Index of defects found by the E2E suite. Governed by
[`e2e-goal.md`](./e2e-goal.md) — see that doc for the required fields, severity
definitions, and the triage rule.

Detail lives in the linked issue; this table is the traceability index
from plan scenario → defect → fix.

Severity: **S1** data loss / funds at risk / irreversible wrong on-chain write ·
**S2** core flow blocked, no workaround · **S3** wrong state shown, workaround
exists · **S4** cosmetic or copy.

Status: `open` → `triaged` → `fixed` → `verified` (verified = the test passes
with its original, unweakened assertion).

**Logging update (2026-10-21):** the user confirmed that all bugs reported in this session were logged in Linear: E2E-040/Q3, E2E-041/Q8, E2E-031/Q4, Q18 primary-picker exclusion, and E2E-042/Q56. Ticket identifiers were not supplied. Logging does not imply a fix or verification; do not create duplicate tickets.

| ID | Scenario | App | Sev | Summary | Expected (oracle) | Repro | Issue | Status |
|---|---|---|---|---|---|---|---|---|
| E2E-042 | Q56 | portal | S3 | Native V2 4LDs have a Roles navigation link, but opening it displays **Only 2LD and 3LD .eth names are supported**. The owned leaf has ROLE_SET_RESOLVER_ADMIN in its immediate parent UserRegistry; the refusal occurs before the owner query because `apps/portal/src/routes/$name/roles/index.tsx` caps labels at three. Observed 2026-10-21 on `leaf.middle.native-fourld-1792570049.eth`. This turns the previously noted depth cap into a native V2 runtime witness. | A native V2 4LD owner can view and manage name roles with the same authority checks as a 3LD. | `pnpm test:portal --project=portal-e2e --grep @scenario:Q56` (real bigname; late expected failure after chain authority checks) | Logged in Linear (user confirmed; link pending) | open |
| E2E-041 | Q8 | manager | S2 | A remaining V1 registry 4LD is stranded after its ancestors upgraded in an earlier session. The test migrates the 2LD and 3LD while a second wallet holds the leaf, then transfers the V1 leaf back to the wallet that owns both V2 ancestors. Registry ownership and stored V1 records are confirmed; bigname reflects the new holder. After a reload, a fresh V1 positive control is offered but the leaf never appears (60-second observation, 2026-10-20). `hasCompleteCopyRoute` in `packages/migration/src/service/classifyNames.ts:563-584` requires the ancestors in the current V1 classification and cannot use their existing V2 registries. | The same owner can upgrade the remaining V1 leaf under its already-upgraded ancestors, or receives an actionable explanation and recovery path. | `pnpm test:manager-migration --project=manager-migration --grep @scenario:Q8` (real mode; late expected failure after the positive control and chain checks) | Logged in Linear (user confirmed; link pending) | open |
| E2E-040 | Q3 | manager | S2 | An emancipated V1 4LD under another wallet’s locked 3LD and locked 2LD is offered as an independently selectable upgrade. Selecting it alone leaves **Upgrade 1 name** disabled and displays only **Couldn’t prepare your upgrade. Please try again.** Reproduced twice on the real stack on 2026-10-20. The original NameWrapper owner and records remain; no migration is submitted. | Migrate the independently emancipated child, or explain the unmet ancestor prerequisite before offering an unusable action. | `pnpm test:manager-migration --project=manager-migration --grep @scenario:Q3` (real mode; expected failure on the disabled upgrade button) | Logged in Linear (user confirmed; link pending) | open |
| E2E-039 | WEB-1445 (V1 history) | portal (#1354) + bigname | S2 | **WEB-1445 has regressed on the bigname read path: a contract nobody assigned can write a V1 name's history.** With #1354 the History page and the Resolver page's scoped history read one stream, bigname `GET /v1/names/{name}/history`. bigname files every resolver-shaped event that carries the node under the name, whichever contract emitted it, and the explorer passes them through unfiltered (`features/history/timelineEvent.ts`; the subgraph-path filter from #1210 has no bigname counterpart). Reproduced locally 2026-10-19 (bigname main 5982ba628): two `anvil_setCode` emitters forge `AddrChanged(node, 0xbad0…0bad)` and `TextChanged(node, "url", "https://phish-…")`, and both render as the name's own records on History and Resolver. The same holds for the owner's own writes to a PublicResolver **while the name was not pointed at it** (before any resolver was set, after moving away, after unsetting): all render. **Not V1-only:** forged on 2026-10-19 against a migrated V2 name (`qa-locked-csr-certified-…eth`, `ens_v2`, records on PublicResolverV2), bigname files both forged rows under it beside the real edits. A V2 name registered natively on its own PermissionedResolver (`e2e-portal-mvf6nej1.eth`) did not pick them up. **Fixed 2026-10-19 in #1354 `ea469d7e9`:** the explorer reads each name's resolver-pointer changes and keeps a record row only from the resolver assigned when it was written (name history, record history, homepage feed, address history). Verified locally: the three WEB-1445 tests pass with their original assertions (twice each), and the forged V2 rows on `qa-locked-csr-certified-…eth` no longer render on History or Resolver. bigname itself still files the forged rows under the name, so any other reader of its history needs the same filter. bigname's history rows carry `contract_address` and the `resolver_changed` rows, so either side can scope records to the resolver assigned at that (block, logIndex). | A record event shows in a name's history only if its emitting resolver was the name's resolver at that event (WEB-1445 / #1210 semantics) | `E2E_EXPLORER_INDEXER=bigname pnpm e2e:portal --grep "WEB-1445"` (real mode) | #1354 `ea469d7e9` | verified |
| E2E-038 | GW6, GR* (mainnet) | manager (`@ens-apps/migration`) | S2 | The migration's own list of V1 public resolvers puts **mainnet PublicResolverV4 `0xF29100983E058B709F3D539b0c765937B804AC15` under Sepolia** and leaves it out of mainnet (`packages/migration/src/contracts/knownResolvers.ts:16-34`). The address has code only on mainnet (14,512 bytes; none on Sepolia). On mainnet a name on V4 — the wrapper-aware resolver most wrapped names use — would therefore not count as a known public resolver: its resolver strategy degrades to `keep-v1` (no records read or replayed onto an owned PermissionedResolver), and for a **locked CANNOT_SET_RESOLVER** name the manager skips its PublicResolverSet membership check (`requiresPinnedPublicResolverMembership` needs `isKnownPublicResolver`), so the migration would go ahead and, if V4 were not certified, leave the name on a V1 resolver nobody can write to — without the refusal E2E-037 shows. Found by reading the list against the contracts-v2 deploy script, which certifies V3 `0x231b0Ee1…` and V4 for mainnet. Not reachable today: the manager's migration manifest is Sepolia-only. | Each network's list holds that network's public resolvers: mainnet gains V4 (and V3 via ensjs), Sepolia drops the mainnet-only address | Code reading; reproduce once mainnet migration is configured | — | open |
| E2E-037 | GW6 | manager + contracts config | S2 | A **locked V1 name with CANNOT_SET_RESOLVER burnt that sits on a V1 public resolver the migration controller does not certify cannot be migrated at all**, and the manager says only "The upgrade contracts don't match this account. Please contact support." The locked controller replaces the V1 resolver with PublicResolverV2 only when its `PublicResolverSet` includes it; the manager checks that first (`assertLockedPublicResolverSetMembership`, invariant `public-resolver-set-membership`) and blocks the upgrade when it does not — correctly, since the name's resolver can never change otherwise — but with a message that names neither the name nor the cause. **Sepolia:** the set includes the older public resolver `0xE99638b4…` but not `0x8FADE66B…` (ensjs `ensPublicResolver`, the one the apps and fixtures use): the deploy script approves "the single resolved v1 PublicResolver" (contracts-v2 `deploy/01_PublicResolverSet.ts`, branch `deploy/mainnet-v2-20261002`). **Mainnet (read 2026-10-19):** the set (`0xfFCe…bf62`, read through both the replaced controller `0xa19d…7BE6` and its 2026-10-18 replacement `0xc46b…694d`, whose PublicResolverV2 is now `0x66f9…a3e1`, no longer the `0x9Ca5…371f` the ticket names) includes **neither** PublicResolverV3 `0x231b0Ee1…` nor PublicResolverV4 `0xF2910098…`, which the same script lists for mainnet. The approvals are queued in the ENS DAO proposal for the 2026-10-18 replacement (contracts-v2 `contracts/deployments/mainnet/dao/calls.jsonl`, two `PublicResolverSet.approve(…, true)` calls; only the DAO timelock `0xFe89…44b7` holds `ROLE_APPROVE`), so mainnet needs re-checking once that proposal executes; until then every locked CSR mainnet name on those resolvers would be blocked the same way. Verified end to end on the local fork: on `0xE99638b4…` the name lands on PublicResolverV2 and its owner edits a record in the manager and the explorer (`migration-resolver.spec.ts` "certified"); on `0x8FADE66B…` the upgrade is refused ("current"). | Every locked CSR name on a wrapper-aware V1 public resolver migrates (the set certifies the resolvers in use on that network); where one cannot, the page names it and says why | `pnpm e2e:cross-app --grep "check 2"` (real mode) | — | open |
| E2E-036 | F15, F19, F20 | portal | S2 | The explorer **refused to transfer any subname** — "The transfer itself would fail, so nothing was sent. If the recipient is a contract, it may not be able to receive this name." A registry that is not emancipated (every subname's UserRegistry) refuses `safeTransferFrom` with `TransferUnsafeUntilRegistryIsEmancipated` (contracts-v2 `PermissionedRegistry.sol:531` on the deployed `audit-results` branch); the move has to use `unsafeTransfer(address,uint256,bytes)`. The explorer switched to `unsafeTransfer` only when other role holders remained (#1251), so for a subname its pre-flight simulated a `safeTransferFrom` that always reverts. **Correction (2026-10-19):** this entry first said the registries do not implement `unsafeTransfer` — wrong: that check used a three-address signature that does not exist and contracts-v2's stale `main`; selector `0x087b0790` is present in both the UserRegistry implementation and the `.eth` registry. **Fixed by #1391** (WEB-1829, merged to `main` as `6e960f2f5`), which also reads the registry's `isEmancipated()` and uses `unsafeTransfer` whenever the registry would refuse the safe path; F15, F19, F20 pass on `e2e/portal-bigname` with #1391 (2026-10-19). Reaches `e2e-tests-coverage` with the next `main` merge. | A name the wallet may transfer can be transferred | `pnpm e2e:portal --grep "@scenario:F(15\|19\|20)"` (real mode, portal on bigname) | [#1391](https://github.com/ensdomains/apps-monorepo/pull/1391) | fixed |
| E2E-035 | R8 | manager | S3 | After A transfers a V2 name to B **keeping the resolver and the ETH record**, the manager's **primary-name picker drops the name for A**, though it still resolves to A and is therefore a valid primary name for A. Candidates are owned V2 names only (`features/dashboard/service/queries/getPrimaryNameDomains.ts:25-35`, `relations: ['owner'], protocol: 'v2'`). Primary-name validity is decided at read time by `addr(60)` matching the address (`ens-contracts/.../AbstractUniversalResolver.sol:245-272`, `ReverseAddressMismatch`); setting one checks no ownership. ens-app-v3 offers such names (`checkAvailablePrimaryName.ts:17-19`, `e2e/specs/stateless/setPrimary.spec.ts:25`). bigname's `resolves_to` relation would supply them. Found manually on Sepolia (`fox-1.eth`, A = `0xF7C5…d063`: `addr(60)` = A); reproduced locally 2026-10-15 with a control name A still owns, which the picker offers. Whether ETH-record-only names belong in the picker is a product decision (ens-app-v3 included them). | A name whose `addr(60)` is the connected address is offered as a primary-name candidate (ens-app-v3 parity), or the product rules otherwise | `pnpm e2e:manager --grep "can still pick it as primary"` (real mode; `test.fail()` until fixed) | — | open |
| E2E-034 | R8 | manager | S3 | After A transfers a V2 name to B **keeping the resolver**, the manager **hides Edit Profile from A**, though A can still write the records: the resolver is A's own PermissionedResolver and record writes are gated by roles on the resolver, not by the registry token. The test proves it on chain: after the transfer A writes a text record through ensjs `setRecords` and it lands. The edit gate is token-owner equality only (`features/profile/components/view/ProfileActions.tsx:73-74`, `ProfileView.tsx:44-55`, `ProfileEditAction.tsx:37`); a resolver write probe already exists (`features/profile/service/resolverWriteAccess.ts:27-83`) but only the primary-name dialog uses it. The explorer shows A's rights correctly. Found manually on Sepolia (`fox-1.eth`: resolver `0xD2C8…F64a` is A's PermissionedResolver proxy; `roles(0, A) = 0x1111…`); reproduced locally 2026-10-15 with a control name A owns, which offers Edit Profile. Note ens-app-v3 required owner **and** an authorised resolver to edit (`getEditAbilities.ts:61-98`); ENSv2 lets a resolver role holder write — the manager's rule needs a product decision, but hiding a right A really has is wrong either way. | Edit Profile is offered to any account the name's resolver lets write records (or the product rules otherwise, and the page says why) | `pnpm e2e:manager --grep "can still edit the profile"` (real mode; `test.fail()` until fixed) | — | open |
| E2E-033 | X4 (manual) | bigname (hosted) + manager | S3 | After A transfers a V2 name to B, **the sender's My Names keeps the name, tagged "Manager"**, and nothing on it works for A. On chain A holds nothing: the transfer moved every registry role (`EACRolesChanged` on `rgkk.eth`: A `0x1110…01100000 → 0x0`, B `0x0 → 0x1110…01100000`, one tx, block 11912470), and no registry holds the node for A. The **hosted bigname contradicts itself**: the name record for `rgkk.eth` and `fox-1.eth` serves owner = manager = B (`/v1/lookup`), yet `/v1/addresses/{A}/names?relation=any` still lists both for A with `relations: ["manager"]` (measured 2026-10-15). The manager trusts that relation (`dashboardNames.ts:50-57` maps `manager`/`role_holder` to the Manager tag) with no cross-check. **Not reproduced on the local bigname**: the same transfer (resolver detached and kept) drops the name from A's list (X4, `transfer-observers.spec.ts`, passes as a regression guard). So the fault is in the hosted index's address-relation projection; the manager's part is showing an index relation the chain contradicts (INV4). | A name the address holds nothing on is not listed; a "Manager" tag means the address can change the name's registry record | Hosted only: `curl "https://sepolia.api.bigname.sh/v1/addresses/0xF7C5572Deeac120A7DfCEBF60EBE0358Fd33d063/names?namespace=ens&relation=any&q=rgkk"` vs `/v1/lookup` for `rgkk.eth`. Local guard: `pnpm e2e:manager --grep "@scenario:X4"` | [bigname#1149](https://github.com/ensdomains/bigname/issues/1149) | open |
| E2E-032 | GS21 | manager | S3 | A V1 **registry-only subname whose label the index does not know** is **silently left off** the upgrade list, and its parent migrates without it. `setSubnodeOwner` puts only the labelhash on chain (`NewOwner`), so bigname lists such a child as `[labelhash].parent.eth` unless its label reached it another way (an event carrying the name, or a rainbow-table import). Classification rejects it as `unknown-label` before anything is sent (`packages/migration/src/service/classifyNames.ts` `UNKNOWN_LABEL_PATTERN`, `classifyName`) — correct, since the copy must pass the label to `UserRegistry.register` — but `getUnavailableNames` renders only `missing-registration` and `not-reserved` (`useEligibleV1Names.helpers.ts`), so the owner never learns the subname exists or why it was not carried. Measured on the local bigname with a never-seeded label (2026-10-14): the parent is listed and offered, the child appears nowhere. How often production hits it depends on which labels the hosted bigname can name (its rainbow coverage was not checked); what happens to the left-behind subname's resolution once its parent is in V2 was not measured. Same rendering gap as E2E-020 and E2E-031, different reason. | Every input lands in a visible bucket (INV3): the subname is shown as not upgradable, saying its name could not be read | `pnpm e2e:manager-migration --grep "@scenario:GS21"` (real mode; `test.fail()` until fixed) | — | open |
| E2E-031 | GS20, GS23, Q4 | manager | S2 | **Also reproduced at depth four (Q4, 2026-10-20):** a locked 2LD → locked 3LD → unlocked wrapped 4LD. The 4LD is omitted; migrating both ancestors succeeds, but UniversalResolver `text(com.twitter)` changes from `fourld-migration` to empty. Direct V1 resolver reads still return the value, and the original 4LD holder remains. This is resolution loss through the new WrapperRegistry path, not deletion of stored V1 data. A V1 **registry-only subname under a locked 2LD** (created before the parent was wrapped and locked) is **silently left off** the upgrade list — and **migrating the parent then stops the subname resolving**, with no warning before or after. A locked 2LD takes the WrapperRegistry token route and a registry-only child has no token to follow it, while the copy route needs an unwrapped or unlocked parent, so `hasCompleteCopyRoute` demotes it to `missing-parent` — correct — but that reason is not rendered (`getUnavailableNames` shows only `missing-registration` and `not-reserved`). Measured 2026-10-14 on the local bigname (GS23): the subname resolves its text record and ETH address before the upgrade; after the locked parent migrates alone, both read back empty through the UniversalResolver, since resolution now walks the parent's V2 WrapperRegistry, which never received the subname. The V1 registry entry still exists, so the name is recoverable by re-creating it under the parent in V2, but nothing tells the owner. **Way out, verified (GS22):** wrap the subname and burn PARENT_CANNOT_CONTROL on it from the locked parent before upgrading; it is then a `detached-child` and migrates into the WrapperRegistry with its parent. The same shape under an **unlocked** wrapped 2LD is copied correctly (GS19). S2 rather than S3: a working name stops resolving as a side effect of the upgrade, and the owner is never told. | Before the owner confirms the parent's upgrade, the subname is shown as not upgradable, saying it will stop resolving and how to bring it along (wrap and emancipate) (INV3) | `pnpm e2e:manager-migration --grep "@scenario:(GS20\|GS23)"` (real mode; both `test.fail()` until fixed) | Logged in Linear (user confirmed; link pending) | open |
| E2E-030 | A22 | manager | S3 | When a label is registered by someone else while this tab is mid-checkout (pricing loaded, USDC chosen), pressing **Register name** runs on for about a minute (through the commitment wait) and then shows **"Error loading name: Try again"**. It never says the name was taken. "Try again" navigates to `/<name>`, which still renders the registration presets with prices stuck on "…". The tab is not stuck, and the name is not falsely reported as won, but the user cannot tell what happened. Same in mock and real mode. Reproduced by registering the exact label from another account (`makeV2Name({ exactLabel: true, owner: 'other' })`) between choosing USDC and confirming. | The losing tab says the name was just registered and is no longer available (and leads to its profile), without a generic error | `pnpm e2e:manager --grep "@scenario:A22"` (`test.fail()` until fixed) | — | open |
| E2E-029 | B4 | manager | S3 | `/renew/$name` for an ENSv2 name **past its 28-day grace** renders the whole renewal page — duration presets (prices stuck on "…"), "Renew to date", and an enabled **"Pay with stablecoins"** — although the name cannot be renewed: on chain it is AVAILABLE and `ETHRegistrar.getRenewPrice` reverts. The name is open to anyone to register (with a decaying premium), which is what the owner needs to know. Contrast B11: the same deep link for a never-registered name redirects to `/register/$name`. Same in mock and real mode. | Renewal is not offered; the page redirects to registration or says the name's grace has ended and it is available | `pnpm e2e:manager-migration --project=manager-migration-time --grep "@scenario:B4"` (`test.fail()` until fixed) | — | open |
| E2E-028 | GA10 | manager | S3 | When a selected name's token **changes owner** between selection and confirmation, the upgrade stops with **"A permission is missing. Try again."** — the wrong reason, and an instruction that cannot work: the wallet no longer holds the name, so no retry or approval will migrate it. Likely mechanism: the transfer leaves the MigrationHelper unapproved for the new holder's token, so the simulation reverts `ERC721InsufficientApproval` before any owner check, and `decodeMigrationError` maps that to `permission-missing`. The app has the right copy ("One of your names changed owners. Refresh and select it again.", `token-owner-changed`) and does not reach it. Nothing moves on chain (the token stays with the new holder, V2 stays RESERVED). For contrast, an operator approval revoked behind the page ends correctly on "Your permissions changed. Go back to check the updated estimate." (unwrapped and wrapped). | The upgrade stops and names the owner change (`token-owner-changed`) | `pnpm e2e:manager-migration --grep "@scenario:GA10"` — the token-moved test is `test.fail()` until fixed | — | open |
| E2E-027 | GW4 | manager (+ bigname attribution) | S2 | A **desynced wrapped 2LD** — registrar lease live, NameWrapper expiry lapsed — **vanishes from its owner's upgrade flow**. It arises from a registrar-only renewal of a wrapped name — any renewal made through a legacy V1 controller rather than the NameWrapper, which is why ens-app-v3 models a `desynced` state and why `ETHRenewerV1` ships a separate `syncWrapper(labels)`. (Corrected 2026-10-11: the deployed `ETHRenewerV1` itself syncs the wrapper inline — traced, and pinned by B15 — so the manager's own V1 renewal does not create this state; names already desynced before launch still reach it.) Once the wrapper's old expiry (old registrar expiry + 90 days) passes, `NameWrapper.getData` reports owner 0 (PARENT_CANNOT_CONTROL is burnt on every wrapped .eth 2LD), bigname records the name as `active`, `wrapper_state: "lapsed"`, **owner and manager null**, and it is absent from the wallet's ENSv1 listing — so /upgrade never shows it, under any bucket. The name is recoverable (a `syncWrapper` restores the wrapper expiry, and with it the owner), but nothing in the manager calls or offers it (no `syncWrapper` anywhere in the app). Measured on the fork: registrar expiry > now, wrapper expiry < now, wrapper owner 0, V2 RESERVED at the renewed expiry; a control wrapped name beside it is listed. | The owner sees the name, and is offered the wrapper sync (or the reason it cannot be upgraded) — never silence (INV3) | `pnpm e2e:manager-migration --project=manager-migration-time --grep "@scenario:GW4"` (real mode; `test.fail()` until fixed) | — | open |
| E2E-026 | GM5 | manager | S4 | A name that has **already migrated**, while the index still lists it as ENSv1, is dropped from /upgrade **without a word**. The selection is safe — it cannot be picked again (GU6 passes): the live preflight reads the chain and finds the V1 token gone. But the `already-migrated` ineligible reason exists in the enum (`classifyNames.ts:38-50`) and is never produced, `domain.isMigrated` is never read, and `getUnavailableNames` only renders `missing-registration` and `not-reserved`. A control name beside it is listed normally. Seen in practice only while the index lags the migration (a live local bigname flips the authority to ENSv2 within about a second), so the window is short. | Every listed input lands in a visible bucket (INV3): the name is shown as already upgraded | `E2E_MOCK_INDEXER=true pnpm e2e:manager-migration --grep "@scenario:GM5"` — migrates a name, reloads with the stale V1 listing (`test.fail()` until fixed) | — | open |
| E2E-025 | GS10 | manager | S3 | An unlocked subname **wrapped under an unwrapped 2LD** (`NameWrapper.wrap`, which gives it no fuses and a wrapper expiry of **0**) is **silently left off** the upgrade list, and its parent migrates without it. Classification accepts it as a copy (`classifyNames.ts:416-423`: zero expiry without PARENT_CANNOT_CONTROL means "no independent expiry", deliberately not expired), but the live preflight drops it: `preflightChecks.ts` `isWrappedResultUnavailable` tests `expiry <= now` for copies with no such exemption, and `useEligibleV1Names` removes it from `eligible`. bigname lists the child correctly (owner = the wallet, wrapped, fuses 0, `wrapper_expires_at: null`, reason `not_set`). Nothing tells the owner. Likely second fault behind it: were it kept, the copy would pass `sourceExpiry = 0` to `UserRegistry.register`. A wrapped child with its own expiry under a wrapped 2LD is copied fine (GS3, and the 4-level chain in GS10). | The child is offered under its root and copied into the parent's UserRegistry, or shown as not upgradable with the reason | `pnpm e2e:manager-migration --grep "@scenario:GS10"` (real mode; the unwrapped-parent test is `test.fail()` until fixed) | — | open |
| E2E-024 | GR13 | manager | S1 | Migration **silently drops every record when bigname has not yet listed the name's record keys**. The app learns which records exist only from bigname's key inventory (`seen_texts`, `seen_addresses`, `seen_singletons`, `seen_abis`; `v1ProfileKeys.ts`) and reads values on chain for those keys alone. An empty inventory is taken as "no records": no profile fetch, no replay, and the name still moves to the owner's new PermissionedResolver, so the V1 records stop resolving. It only fails safe (`ProfileFetchError`) when a name is missing from the lookup entirely, not when its key lists are empty. Measured on the local bigname (iteration 35): keys arrive **1.0–1.5 s after** the block is published and the name is listed, and a full-suite run hit the window (GR8 migrated with all four records lost). In production any indexer lag on the records projection opens the same window, and the loss is irreversible. | Records on chain survive migration, or the app refuses to migrate until the index is current for the name (e.g. bigname's indexed block ≥ the name's latest resolver event) | `E2E_MOCK_INDEXER=true pnpm e2e:manager-migration --grep "@scenario:GR13"` — records on chain, the mock lists none of the keys (`test.fail()` until fixed) | — | open |
| E2E-023 | GR6, GR7, GU9 | manager | S1 | Migrating a V1 name on a known public resolver **silently drops its pubkey and interfaceImplementer records**. The app reads and replays only text, multicoin address, contenthash and ABI (`V1_RESOLVER_PROFILE_ABI`, `buildProfileReplayCalls.ts`); nothing reads `pubkey` or `interfaceImplementer`, and nothing on the upgrade screen mentions them. The screen promises the opposite ("Your names, text records, and addresses will be carried over"). After the upgrade, measured through the UniversalResolver: `pubkey` **reverts** (the V2 PermissionedResolver has no pubkey record, so even a replay could not carry it) and `interfaceImplementer(0x12345678)` returns **zero**, though the V2 resolver does store interfaces (`InterfaceUpdated`) and the owner could have it replayed. A text record migrated beside them survives. Irreversible: the name has left V1. | Each record resolves to its V1 value after the upgrade, or the owner is told before confirming which records will not be carried | `pnpm e2e:manager-migration --grep "@scenario:GR6"` (`test.fail()` until fixed) | — | open |
| E2E-022 | — (local bigname, harness) | bigname (dev) | S2 | bigname's interpret phase stopped for good ("surface binding … is already bound to different identity data") whenever Anvil mined two consecutive blocks in the same second carrying events for one ENSv1 name — in our fixtures a V2 `LabelReserved` (pre-migration reservation) followed by `wrapETH2LD`'s ENSv1 `NewOwner`. ENSv1 binding ids are seeded from the authority key and the event instant (block timestamp + log index), with no block number, so the two collide; the upsert's `active_from` guard then rejects the second. Real chains cannot produce it (strictly increasing timestamps). Reproduced on a fresh fork and fresh database; the same pair one second apart indexes fine. Every real-mode manager test after the stall timed out waiting for bigname. | Local bigname indexes every block the fixtures produce | seed a wrapped `makeV1Name` twice on a fresh fork until reserve and wrap share a second | dev patch, bigname branch `e2e/anvil-fork-start` commit `0f6c2171d` (not pushed; issue drafted, not filed) | **verified** |
| E2E-021 | GW7 | portal | S4 | The owner of a migrated locked name that burnt **CANNOT_BURN_FUSES** in V1 is offered **Add user** (and the per-row role editor) on `/{name}/roles`, though it can grant nothing. The migration freezes the role set (`LockedWrapperReceiver._tokenRoleBitmapFromFuses`: no `*_ADMIN` when CANNOT_BURN_FUSES is burnt), leaving only `ROLE_CAN_TRANSFER_ADMIN`, which has no user role to hand out. `NameRolesOverviewTable` sets `canManageRoles` when the account holds *any* admin role, so that one bit is enough to show the controls. A plain migrated locked name owned by the same wallet is the positive control (it does hold `ROLE_SET_RESOLVER_ADMIN`). | Role management is offered only when the account holds an admin role with something grantable beneath it; a frozen name shows none | `pnpm e2e:portal --grep "@scenario:GW7"` | — | open |
| E2E-020 | GW5, GW12, GU1 | manager | S3 | A locked V1 `.eth` name that can **never** migrate — CANNOT_TRANSFER burnt (the NameWrapper refuses the transfer, `LockedMigrationFuseMatrix.t.sol` `test_fuseMatrix_cannotTransfer_alwaysReverts`) — is **silently left off** the upgrade list. `classifyLockedWrapper` returns `ineligible('not-transferable')` correctly, but nothing renders `ineligible`: with a control name beside it, /upgrade lists only the control ("All 1 names selected"); with the frozen name alone there is no Upgrade banner at all, while My Names still shows it under V1. The owner is never told the name cannot be upgraded or why. Same for Locked+All (GW12). | Every input lands in a visible bucket (INV3): the name is shown as not upgradable, naming the transfer fuse | `pnpm e2e:manager-migration --grep "@scenario:GW5"` | — | open |
| E2E-019 | WEB-1572 test 1 (found verifying #1310) | portal | S3 | After a registration completes, opening another name **in-app** (sidebar search, no reload) and pressing Register shows the **previous run** in the transaction modal: Submit commitment, Approve payment and Register name all "Done", each linking the first name's transaction, with Done in place of Start. The new name is still available; nothing is sent. Pressing Done clears it and Register then starts a fresh run, as does a reload. Same on `e2e-tests-coverage` before #1310. Likely cause: `useRegistrationTransactions`' unmount cleanup returns early on `success`, the app navigates away after success without `handleDone`'s `clearTransaction()`, and `REGISTRATION_TX_IDS` are shared across names, so the next page's step list renders the old transactions. | The second name's overview lists its own steps as Not Started and offers Start | Register A to success, search B in the sidebar, Enter, USDC, Register. Screenshots and chain evidence in the verify session's report (test plan [`resolver-reuse-web1572-test-plan.md`](./resolver-reuse-web1572-test-plan.md) F1) | — | open |
| E2E-018 | WEB-1229 follow-up | portal | S3 | Closing the registration's transaction modal after a step **really** failed wipes the whole run. `TransactionModal`'s close handler calls `transactionManager.clear()` whenever the latest transaction has an error, and `clear()` drops **every** transaction, not only the failed one. Reopening via **View registration progress** shows the landed deploy and commitment as "Not Started" with **Start**; pressing Start begins a new run, and the chain shows a **second** `deployProxy` and a **second** `commit` from the wallet for one registration (gas for a spare resolver and commitment; USDC is charged once). Found verifying PR #1284, which stops a *stale* error from triggering the same clear; a real failure (e.g. the user rejects the approve) still does | The reopened overview shows Deploy resolver and Submit commitment **Done**, each linking its mined transaction, and offers no Start (`expectStepDone` + no `Start` button) | `pnpm e2e:portal --grep "closing the modal after a step really failed"` (`test.fail()` until fixed) | _pending_ | open |
| E2E-016 | VK20, VK21, VK22, VK28, VK31, VK42, VK43, VK45 | portal | S3 | The Token tab tells the owner of a **registry-only V1 subname** that their name is an **ERC-721 on the BaseRegistrar**, and shows a token id for it. It is neither. A subname held directly in the legacy registry has no token of any kind — the BaseRegistrar only ever holds `.eth` 2LDs — and the id shown is `labelhash(leaf label)`: for `l1.v1m-20-….eth` the page printed `14348782382986100785356643067205758148600308114560913711117973050161833687690`, which is exactly `cast keccak l1`. Measured on the fork: `BaseRegistrar.ownerOf` on that id **reverts** (no such token), and `nameExpires` returns 0. The id is not meaningless, though — it lives in the **2LD namespace**, so it is the token id `l1.eth` would have. Register that 2LD and the subname’s Token tab starts pointing at a stranger’s NFT, with a contract address and id a holder could act on in an explorer or a marketplace. Source: `routes/$name/token.tsx` picks ERC-721 vs ERC-1155 purely on `getWrapperData` being null, then computes `labelhash(name.split('.')[0])`, which is only correct for a 2LD. A wrapped subname is handled correctly (ERC-1155, NameWrapper, namehash). Found by the V1 shape matrix (2026-09-14). | A registry-only subname has no token: the tab says so, rather than naming a contract and id that belong to another name | `pnpm e2e:portal --project=portal-v1-matrix --grep "@scenario:VK20"` — seeds a registry subname and asserts the tab does not name the BaseRegistrar. Marked `test.fail()` | _pending_ | open |
| E2E-017 | VD20, VA20, VD21, VA21, VD22, VA22, VD23, VA23, VD24, VA24, VD25, VA25, VD26, VA26, VD27, VA27, VD28, VA28, VD29, VA29, VD30, VA30, VD31, VA31, VD40, VA40, VD41, VA41, VD42, VA42, VD43, VA43, VD45, VA45 | portal | S3 | **WITHDRAWN 2026-09-18 — not an app defect.** Filed because a V1 subname's records and ETH address render empty on the fork while the resolver holds both, and a V1 2LD seeded identically renders fine. The mechanism I measured was real — `UniversalResolver.findResolver` returns the subname's resolver at a non-zero offset, i.e. matched at the parent, making the read an ENSIP-10 wildcard call the V1 PublicResolver cannot serve. The inference from it was wrong, because I never compared against real Sepolia. **What real Sepolia actually does (measured 2026-09-18 on `1.dappwright-test-1758107190099.eth`, an unwrapped V1 subname whose records render correctly in the live explorer):** `findResolver` returns **`0xb2BF4a9A86d29661EA93223582b9945943931e42` at offset 2** — and returns the *same* contract at offset 0 for its 2LD. That is the **ENSV1Resolver wildcard**, not either name's own registry resolver. It is ENSIP-10 capable, so wildcard reads succeed and subname records resolve. On the fork the same lookups return the plain V1 PublicResolver (`0x8FADE66B…`), which is not. **So the fork is in the wrong state, and it is a state this repo already knows it is missing:** `HW10` — *“Premigration state builder — put the fork in a realistic post-premigration state (all V1 names RESERVED in V2, **ENSV1Resolver wildcard**, V1 registration disabled)”* — is recorded **not-started** in `e2e-coverage.md`, missing `fixtures/premigration.ts`. Until it exists, every V1 record and address cell is asserting against a resolution path that does not exist on Sepolia. **Consequences:** the cells listed here move from DEFECT to blocked-on-HW10 rather than staying red; and the same doubt applies to any V1 resolution behaviour the matrix currently claims, 2LD included — the 2LD cells pass only because an offset-0 lookup happens to work against the plain resolver. **What was genuinely fixed along the way:** the empty Subnames tab, which was the missing V1 subgraph and is now served by `packages/v1-subgraph-shim`. | A V1 subname's records and ETH address render from the resolver, as they do on Sepolia today | Re-verify once `HW10` lands and the fork resolves V1 names through the ENSV1Resolver wildcard | HW10 | **withdrawn** |
| E2E-015 | VO7, VO24 | portal | S4 | For a **wrapped** V1 2LD the Ownership tab renders a **Manager** row containing the **NameWrapper contract address** (`0x0635…FcE8`). Nobody holds that address: a wrapped name has one holder, the wrapper owner, and the legacy registry slot is the wrapper itself by construction. The row presents a contract as though it were an account a user could act as, on the page people read to find out who controls a name. ens-app-v3 — the app that owns V1 — deliberately renders no manager row for these names: `src/hooks/ownership/useRoles/utils/getRoles.ts:31-36` returns `owner` + `eth-record` for `eth-emancipated-2ld` and `eth-locked-2ld`, while the unwrapped 2LD arm above it does return a `manager`. Found by the V1 shape matrix (2026-09-13); measured on both wrapped shapes (emancipated and locked), and absent from the unwrapped ones, so it tracks wrap state rather than the viewer. | A wrapped 2LD shows no Manager row; the wrapper owner is the Owner and there is no second role to name | `pnpm e2e:portal --project=portal-v1-matrix --grep "@scenario:VO7"` — seeds a locked 2LD and asserts the Manager row is absent. Marked `test.fail()` | _pending_ | open |
**2026-10-08 — E2E-001, E2E-012, E2E-013, E2E-014 verified.** Their witnesses ran green on `e2e-tests-coverage` with no `test.fail()`: F1 (all three migrated types), F35, F37, F39 (`pnpm e2e:portal --grep "@scenario:(F1|F33|F35|F37|F39)\b"`, 10/10) and matrix cell VT32 (`portal-v1-matrix-time`). Status set to `verified`, which is what closes a defect in the ledger.

| E2E-014 | F39, VT32 | portal | S3 | Introduced by #1144. While a **wrapped** `.eth` 2LD is in its grace period, its owner opening a subname they don't hold is told **"Not authorized — Only the current owner, or the owner of *2LD*, can move it"** — they are that owner. #1144's `ancestor-grace` card ("*2LD* is in its grace period", with a *Go to 2LD* renew button) never renders. Root cause: in grace the registrar's `ownerOf` reverts, and ensjs `getOwner` (`dist/actions/public/v1/registry/getOwner.js:118-124`) then returns `{ registrant: null, owner: registryOwner, ownershipLevel: 'registrar' }` — and a wrapped 2LD's registry owner is the **NameWrapper contract**. `deriveParent`'s registrar arm reads that as an *unwrapped* parent held by the NameWrapper, so `gateAsParent` finds no match and falls to `not-owner`. The NameWrapper itself still reports the wallet as owner (asserted as a precondition). The PR's unit tests feed `getV1TransferGate` a hand-built parent state, so they never see the ensjs shape. | The 2LD's owner gets the `ancestor-grace` card and the renew link, not "Not authorized" | `pnpm e2e:portal --grep "E2E-014"` | — | **verified** |

**E2E-014 — CLOSED.** fixed 2026-09-17 by #1157, which shows the grace-period card to the owner of a wrapped parent in grace. Both witnesses flipped to "expected to fail, but passed": F39 and the matrix cell VT32.

| E2E-013 | F35 | portal | S4 | Introduced by #1144. When the parent's owner opens an **emancipated** V1 subname's transfer route, the refusal card ends *"Once it expires you can issue it again from the Subnames page."* For a V1 parent that page has no Create button (`canCreateSubname` is only wired for ENSv2, `routes/$name/subnames.tsx`) and `/create-subname` answers *"This feature is only available for ENSv2 names."* — the portal creates subnames on V2 names only, so the real path is to MIGRATE the parent first (and the portal has no migrate CTA; migration lives in the manager app) or to use ens-app-v3, which does create V1 subnames. The card names neither The card also ignores `CANNOT_CREATE_SUBDOMAIN` on the parent — `getV1ParentPowers` correctly drops the re-issue power when it is burned, but this card still promises it. Copy verified absent on `origin/main`, present on `pr-1144`. | The card's way out can be followed: either the Subnames page lets a V1 parent issue the subname, or the copy stops pointing there (and says nothing about re-issuing when `CANNOT_CREATE_SUBDOMAIN` is burned) | `pnpm e2e:portal --grep "E2E-013"` | — | **verified** |

**E2E-013 — CLOSED.** fixed 2026-09-17 by #1165, which stopped pointing the emancipated-subname card at the read-only Subnames page and sends the parent to the ENS Manager instead. Verified by F35, rewritten to assert the Subnames page is NOT named and the ENS Manager route is.

| E2E-012 | F37 | portal | S4 | Introduced by #1144. The `registrant-only` refusal (*"Reclaim the parent first"*) tells the parent's registrant to *"Reclaim the manager role on **parent** from its Ownership page, then come back."* The Ownership page has no reclaim control — it offers Transfer, Extend, a read-only manager row (`V1NameManagerRecord`, no actions) and History, and nothing outside `features/transfer` mentions reclaim. `reclaim` only runs as step one of transferring the parent to somebody else. The refusal itself is correct; its instruction is a dead end. Copy verified absent on `origin/main`, present on `pr-1144`. | The page the card names offers the reclaim it tells the user to do, or the card names somewhere that does | `pnpm e2e:portal --grep "E2E-012"` | — | **verified** |

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
**2026-10-08 — E2E-009 verified.** Both C1 witnesses (`lists every role holder…` and the 1000-newer-events regression) ran green with no `test.fail()` in a full `roles.spec.ts` run (49/49) on `e2e-tests-coverage`.

| E2E-009 | C1 | portal | S3 | **FIXED upstream by #1131, #1133, #1137.** Was: the "parent registry / roles" panel read role holders by replaying the newest `MAX_EVENTS` (hardcoded `1000`) `EACRolesChanged` events for the **whole `.eth` registry** (`events(contractAddress:, first: 1000, orderBy: blockNumber desc)`), then filtering to the name's own `resource` client-side. There is one such event per registration/grant and the live registry has ~170k of them, so the window covered only the newest ~3 days — a grant older than that never reached the filter step. The GraphQL call **succeeded** with a real (just incomplete) result, so the on-chain-log-scan fallback never fired; it only triggered on a hard error. Same class as the fixed "Panoptes indexed a stale contract set" blocker below (success-with-no-rows trusted as a confident empty state), but a distinct root cause: the query was fixed-size and unscoped, so it reproduced even on a fully healthy, fully synced indexer. The fix moves every role query onto one resource-scoped indexed-log helper (`apps/portal/src/lib/roles/roleChangeLogs.ts`), so registry-wide traffic is now irrelevant by construction; `useRegistryRoles.ts` was deleted and the three sibling hooks that shared the identical `first: 1000` shape (`useRegistryRoleHistoryForAccount.ts`, `useRoleHistory.ts`, and the root-holder query) all read through it now | A role holder must not disappear from the panel merely because >=1000 *other* `EACRolesChanged` events landed on the registry after their own grant — the panel must not render "No role holders yet" (indistinguishable from C7/C8's genuine empty state) for an account that `assertRoleBitmap` shows still holds roles on-chain | `pnpm e2e:portal --grep "@scenario:C1"` (`roles.spec.ts`, "keeps listing a role holder after 1000 newer events land on the registry"). The test was inverted in place rather than deleted: it still floods the registry with >1000 newer events on an unrelated resource, still asserts the flood genuinely pushed the target out of a newest-1000 registry-wide window (now a precondition, so a silently-failed flood cannot make it pass vacuously), and then asserts the holder **survives** — which is what a revert to a registry-wide window would break | [#1131](https://github.com/ensdomains/apps-monorepo/pull/1131), [#1133](https://github.com/ensdomains/apps-monorepo/pull/1133), [#1137](https://github.com/ensdomains/apps-monorepo/pull/1137) | **verified** |
| E2E-008 | E1 | portal | S3 | The indexer's `resolver.texts` (and presumably `.addresses`) field appears keyed by resolver **contract address alone**, not by `(address, node)`. Once two different names point their resolver slot at the same already-deployed resolver contract (`setResolver` — the resolver-level analogue of E2E-007's shared-registry pattern), each name's indexed text-key list bleeds into the other's, even though on-chain each node's records stay correctly scoped (verified directly: `text(nodeB, key)` reads empty on-chain while `domains(where:{name:B}).resolver.texts` reports the key). Confirmed deterministic once the indexer-sync race is handled (poll the writer's own domain until the new key appears before asserting on the other name) — an immediate, unwaited check on the reader can pass for the wrong reason | The indexer's `resolver.texts` for a name must reflect only keys ever written to *that name's own node*, never keys written to a different name that happens to share the same resolver contract | `pnpm e2e:portal --grep "shared by two names"` (`records.spec.ts`) | _pending_ | open |
| E2E-007 | D9 | portal | S3 | A subname registered from a name's own `/subnames` page is misattributed to a *different* parent name, if that other name also points its subregistry at the same already-deployed registry contract (via "use a pre-existing registry contract" in `SubregistryConfigurator.tsx`). The indexer doesn't just misattribute the parent relation — it names the child domain entity using whichever name **currently** "owns" the shared registry pointer at index time (e.g. the entity is literally called `purple.kangaroo.eth`, never `purple.koala.eth`, even though `purple` was registered from `koala.eth`'s own `/create-subname` page): a single mutable registry → parent-name pointer, updated on `setSubregistry`, stamped onto every subsequent registration event from that registry regardless of which name's UI actually created it. Confirmed both when one wallet owns both names and when they are owned by two separate wallets (the latter needs an explicit `ROLE_REGISTRAR` grant to the second owner first, matching the Slack report). Mirror evidence also confirmed: the subname registered *before* the registry was shared stays correctly attributed to the original owner, and the second name's page shows both its own subname AND the misattributed one | A subname created from `koala.eth`'s own `/subnames` page must appear on `koala.eth`'s `/subnames` page, regardless of whether another name (`kangaroo.eth`) also uses `koala.eth`'s registry as its own subregistry | `pnpm e2e:portal --grep "subnames registered under a shared registry"` (`subnames.spec.ts` — two variants: same-owner and separate-owners) | _pending_ | open |
| E2E-006 | MD5 | metadata | S3 | `POST /webhook` never purges the L0 edge cache (`caches.default`) for the unified metadata JSON route (`/:network/:registryType/:name`) — a changed record can stay stale there for up to `EDGE_CACHE_MAX_AGE_SECS` (300s) after a successful, accepted webhook call | `handleMetadata` (`src/index.ts`) puts every metadata JSON response into the L0 edge cache via `edgeCachePut`. `handleWebhook`'s purge loop only deletes `{registry,namewrapper}/{name}/{image,rasterize}` L0 keys (its own comment: "L0 only caches images/rasterize... metadata/migration-status carry their own short TTLs" — incorrect once `handleMetadata`'s `edgeCachePut` call is accounted for). The underlying KV (L1) cache IS correctly invalidated — confirmed by re-requesting the same name+registryType with a cache-busting query param (a different L0 key, unaffected by the gap, same KV key) and observing a fresh `last_request_date`. S3 not S2: a workaround exists (wait out the 5-minute L0 TTL, or vary the URL), and no other route is affected | Same exact URL, requested twice with no other change in between, after a real webhook call, should not return byte-identical `last_request_date` | `pnpm e2e:metadata --grep "@scenario:MD5"` (`cache-invalidation.spec.ts`, "does not purge the L0 edge cache") | _pending_ | open |
| E2E-005 | MD6 | metadata | S2 | `GET /registry-hierarchy/:name` 500s unconditionally — every name, every network, every state (registered, unregistered, migrated, unmigrated, native) | `MetadataService.getRegistryHierarchy` (`src/services/metadata.ts`) → `CacheService.set` calls `KV.put` with `expiration_ttl: 30` for the hierarchy cache preset, but Cloudflare KV enforces a hard minimum of 60s (`400 Invalid expiration_ttl of 30. Expiration TTL must be at least 60.`) — the write throws, is not caught, and the whole request 500s instead of just skipping the cache (or 404ing, for an unregistered name — it never reaches the not-found check). Every other cached route uses a >=60s TTL and is unaffected (confirmed: `/migration-status` succeeds against the same names). Reproduced live against a mainnet name, a migrated sepolia name, and a never-registered sepolia name — identical stack trace all three times | 200 with the hierarchy JSON for a registered name (mirroring `/migration-status`), 404 for an unregistered one | `pnpm e2e:metadata --grep "@scenario:MD6"` (`dispatch-and-errors.spec.ts`, "registry-hierarchy") | _pending_ | open |
| E2E-004 | ~~G* (all)~~ — **WITHDRAWN, not a real defect** | manager | — | ~~The dashboard's migration-eligibility query never settles~~ — misdiagnosed. The actual cause of the "Upgrade Names" flake was local test setup: `e2e/.env` had `E2E_MOCK_INDEXER=false`, so the browser hit the real local Panoptes indexer (`getMigratedNamesCount`, which also gates the banner) instead of the mock, and Panoptes in this session had known drift/health issues. With `E2E_MOCK_INDEXER=true` (matching `.env.ci`), the button appeared reliably across 8+ consecutive runs with zero failures. The render-level instrumentation that produced the original "isPending never settles" evidence was real but was observing symptoms of the unmocked, unhealthy indexer call, not an app query-key bug. Left as a row (rather than deleted) so nobody re-diagnoses the same wrong root cause | — | — | withdrawn |
| E2E-003 | F14 | portal | S2 | Retrying a transfer step whose wallet prompt was previously rejected deterministically fails — "Failed to submit transaction: An unknown RPC error occurred", every run, not intermittent | Clicking "Retry" on a step the user previously cancelled should resubmit and succeed like a first attempt; instead the resubmission itself fails at the RPC layer. Reproduced with `wallet.reject(Web3RequestKind.SendTransaction)` on the second of two transfer steps, then clicking Retry and authorizing — see the test for the exact repro. Not chased to a Solidity/viem root cause; `transaction.machine.ts`'s own "nonce too low" guard comment (submitting state, onError) is the most likely lead, since both steps share one signer and a resubmitted step reuses `context.request` rather than re-preparing it. Not S1: step 1's effect (resolver detached) is real and durable, and does not corrupt anything — the user is only stuck on this one retry, not left in a broken on-chain state | `pnpm e2e:portal --grep "shows what already executed and lets the user resume after a rejected step"` | _pending_ | open |
| E2E-002 | F5 | portal | S1 | Transfer to a non-receiver contract detaches the resolver irreversibly, then hangs — token never moves, no error shown | `buildTransferPlan` must not execute `detach-resolver` before a `transfer-token` that cannot succeed; `test_safeTransferFrom_invalidReceiver` must surface as an error, not a stall (plan §5.F F5, and the S1 rule in e2e-goal.md) | `pnpm e2e:portal --grep "@scenario:F5"` | _pending_ | open |
| E2E-001 | F1 | portal | S1 | Migrated locked V1 name offered a `detach-registry` step its owner cannot execute — `detach-resolver` had already run irreversibly | Owner lacks `ROLE_SET_SUBREGISTRY` on the locked name's `WrapperRegistry`, so `buildTransferPlan` must not offer the step. Measured in [`transfer-web446-test-plan.md`](./transfer-web446-test-plan.md) §2 finding F1 | `pnpm e2e:portal --grep "without offering the registry detach it cannot perform"` | _pending_ | **verified** |

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
table is the durable record. A behavior-pinning scenario such as B25, Q13 or
Q18 can still pass its stated oracle; that records the current behavior, not
approval of the product limitation. Their product rulings remain open here.

| Scenario | App | Summary | What's missing | Investigated |
|---|---|---|---|---|
| Q18 | manager | V1 4LDs cannot be picked as primary names | As with E2E-035, the picker restricts candidates to owned V2 names. Q18 proves the owned V1 4LD resolves to the wallet, then uses an owned V2 positive control and an empty search result to pin its exclusion. The user classified this as a bug and confirmed it is logged in Linear on 2026-10-21 (ticket link pending). The current-behavior oracle remains unchanged pending the fix. | 2026-10-20 |
| Q13 (SUB-F3) | portal | Grandparent authority over registry 4LDs is indirect and undisclosed | The transfer page says only the holder or immediate 3LD owner can move the name. The Q13 test proves a different 2LD owner can reclaim the 3LD, then the 4LD with two successful registry writes. The direct transfer refusal is correct; whether to explain this indirect authority remains a product ruling. | 2026-10-20 |
| F6 | portal | Batch transfer (multiple names), incl. one-error-aborts-all `safeBatchTransferFrom` semantics | The names dashboard (`routes/addr/$addr/names.tsx`) has real multi-select row checkboxes, but the only bulk action wired to the selection is **Extend** (renewal). There is no batch-transfer button, route, or modal, and a repo-wide search of `apps/portal/src` for `safeBatchTransferFrom`/`batchTransfer` returns zero hits — the frontend never calls that entrypoint. `SendNameForm.tsx` (the only transfer UI) takes exactly one `name` prop. | 2026-08-29 |
| B25 | manager | Renew V1 and V2 names together | The explorer's names list renews a mixed V1 + V2 selection in one flow (one approval per renewer, then one `renew` per name; B19–B24). The manager's dashboard Renew dialog takes held **V2** `.eth` 2LDs only: V1 rows render without a select button (`MyNamesList.tsx:184`, `selectable={!isV1 && …}`), the selection bar is hidden in the V1 view (`NamesTable.tsx:299`), and the batch always goes to the V2 renewer (`useBulkRenewSubmit.ts:171-174`). A V1 name renews alone on `/renew-v1/$name`, or, in grace, inside the upgrade flow (`ETHRenewerV1.renewBatch`, V1 names only). A holder of both kinds renews them in separate flows in the manager. Pinned by `manager/tests/bulk-renew.spec.ts` (B25) so a change either way is deliberate; needs a product ruling on whether the manager should match the explorer. | 2026-10-20 |

---

## Environment blockers

Not defects — the app behaves as designed — but they stop scenarios reaching a
terminal state, so they are tracked here until fixed.

### Live Sepolia removed two controllers on 2026-10-01, breaking V1 renewal and HCA primary names

**Resolved for the stack, 2026-10-15:** Sepolia restored the adapter as a
`DefaultReverseRegistrar` controller in block 11898021 — one block after the
old pin. The pin is now 11898021, so smart-account primary names work on the
fork (X8 sets one end to end).

**Status at the old pinned fork (block 11898020, re-measured 2026-10-14):** the
renewer half is resolved — `BaseRegistrar.controllers(ETHRenewerV1)` is `true`
again, so V1 renewal works and `expectFailureWhileRenewerDeauthorised()` no
longer marks the grace-period tests. The reverse-registrar half still applies:
`DefaultReverseRegistrar.controllers(ensDefaultReverseRegistrarAdapter)` is
`false` (ensjs now names the adapter `0x36f97328…4066`, not the `0x4F32…a6f5`
below), so `primaryName.spec.ts` still fails. The stack now forks the pinned
block in `e2e/infra/fork-block`, not the live head, so a later change on
Sepolia only arrives when the pin moves.

The original finding, when the stack still forked live Sepolia at its head.
Both came from the BaseRegistrar / DefaultReverseRegistrar owner
`0x0F32b753aFc8ABad9Ca6fE589F707755f4df2353`, within a minute:

| Block | Time (UTC) | Tx | Call | Effect |
|---|---|---|---|---|
| 11821651 | 11:53:48 | [`0x8e740ce7…834254`](https://sepolia.etherscan.io/tx/0x8e740ce7f542538c78cb403fb4b16291ff227b2efca491a0295b2e03d0834254) | `BaseRegistrar.removeController(ETHRenewerV1 0xd06e…6a36)` | `ETHRenewerV1.renewBatch` / `renew` can't extend any V1 name. The bare `require` reverts with no data, which the app shows as "Couldn't estimate the network fee" |
| 11821655 | 11:54:36 | [`0xb820b730…26b7f1`](https://sepolia.etherscan.io/tx/0xb820b7306b31e9919bc22daa7d3004fc651e78f866d69a617236a4c8db26b7f1) | `DefaultReverseRegistrar.setController(ensDefaultReverseRegistrarAdapter 0x4F32…a6f5, false)` | The HCA's `setNameWithHCA` reverts `Controllable: Caller is not a controller`, so post-registration auto-setup never sets the primary name |

**Blocked:**
- `migration-grace.spec.ts`: the 4 tests that renew or estimate a renewal (`renews then upgrades…`, `upgrades an active name and a wrapped…`, `bulk: …`, `several grace-period names…`). They call `expectFailureWhileRenewerDeauthorised()`, which reads `BaseRegistrar.controllers(ETHRenewerV1)` on the fork and marks the test `test.fail()` only while the role is missing. Assertions unchanged.
- `primaryName.spec.ts` (post-registration auto-setup) and `profile.spec.ts` (add/remove records, agent-registration card; these hit "Set up this name's resolver?") — not marked.

**Proof it's the chain, not the code:** on a fresh fork, `main` (`89caa2429`) and #1274's head give identical manager shard 1 results (4 failed, 1 flaky, 2 passed). On a fork taken before 11:53 UTC, the same #1274 head passes (6 passed, 1 flaky).

**Unblock (reverse registrar):** either Sepolia's owner restores the adapter as a controller, or the app moves to whatever replaced it.

### Real mode: the test account's own earlier names push a new name off page 1 (blocks 7 grace-period tests)

Measured 2026-10-14 against the local bigname (manager on bigname, real mode).
All seven `migration-grace.spec.ts` tests fail by not finding their name, not
by anything the app does wrong with it. Rerun alone, `a grace-period name is
offered for renewal…`: bigname lists the name as in grace (`status:
"expired"`, owner = the wallet, `grace_ends_at` set) and the dashboard shows
the grace banner. But the connected wallet (Anvil account 0) is shared by every
test on the chain, and by then it held **34 names**, so My Names (sorted by
name, paged) put the new one off the first page, and `getByText(name)` in
`main` never saw it. In mock mode `serveV1Names` serves only the test's own
names, which is why the specs were written that way.

**Fix (test side):** find the name by searching/filtering the list, or give
each grace test its own fresh wallet, rather than assuming the first page.

### Local bigname cannot name registry-only V1 subnames (blocks GS4, GS14, GS16)

A V1 registry subname created with `setSubnodeOwner` puts only the label
**hash** on chain, and the local bigname has no other source for the label
(how the hosted one fills such labels was not checked), so it lists the name as
`[16670ca6…].migbadres-….eth` and the app shows exactly that. GS4, GS14 and
GS16 look up their child by its real name (`getByTitle('sub.…eth')`) and time
out. Wrapped subnames are unaffected (the NameWrapper emits the full name).
Measured 2026-10-14 on the snapshot of a failing run.

**Fixed 2026-10-14 (test side):** `makeV1RegistrySubname` now writes the
child's label into the local bigname's `label_preimages` table
(`helpers/bigname-labels.ts`); names render from it at read time, with no
reindex. GS4, GS14 and GS16 pass in real mode. `seedLabel: false` leaves a
label unknown on purpose (GS21 → E2E-032). Labels are global per hash: once
any test seeds `sub`, every `sub.*` is named, so a test that needs an unknown
label must use one of its own.

### Test account `user2` has EIP-7702 code on Sepolia (blocks GS18)

**Widened 2026-10-15:** every well-known Anvil account checked carries one
(`user3` `0x3C44…93BC`, accounts 3, 5 and 6 too, delegating to
`0x386f…972a`), so any safe ERC-1155 transfer to them reverts.
`helpers/v2-transfer.ts` clears the recipient's code first.

Anvil account 1 (`0x70997970…79C8`, the fixtures' `user2`) carries
`0xef0100ca11bde0…ca11` at the pinned block — a real 7702 delegation to
Multicall3 that someone set on Sepolia. A safe ERC-1155 transfer to it calls
`onERC1155Received` on Multicall3 and reverts ("ERC1155: transfer to non
ERC1155Receiver implementer"), so GS18's fixture fails before the app is
involved. The manager fixture already clears the same kind of leftover code
for `user` (`playwright.manager.fixture.ts`, `setCode(… '0x')`) but not for
`user2`. Account 4 (`0x15d34AAf…6A65`) has a 7702 delegation too.

**Fix:** clear the code for every account the fixtures hand tokens to.

### Test faults found 2026-10-14 (not app defects)

Failing in real-mode runs and marked PASS in `e2e-coverage.md`; diagnosed as
faults in the test, not the app:

| Scenario | Test | What goes wrong | Fix |
|---|---|---|---|
| GS9 | `migration-subname.spec.ts` "does not offer a subname whose parent is not being migrated" | The parent is registered to the connected wallet itself (`makeV1Name` with `user` = Anvil account 0 = the headless wallet). In mock mode the injection leaves the parent out; in real mode bigname lists it, so offering the child is correct. | **Fixed 2026-10-14**: the parent is registered to `user3`; passes in real mode |
| B5 | `profile.spec.ts` "never offers a renewal date before the current expiry" | Picks the **wall-clock** year in the calendar. After the time-travel suite the shared chain sits in July 2028, the year list starts at 2028, and `selectOption('2026')` waits for an option that never appears. The app's boundary holds. | Use the chain's time (or the first option offered) |
| B2 | `profile.spec.ts` "extend unowned name by 28 days" | Timed out mid-flow once in the full suite; passes alone. | Flake — watch |
| GA3 | `migration-approvals.spec.ts` "operator approvals already held…" | Name not listed once in the offline run; passes alone (twice). | Flake — watch |

**PostHog redirects `/upgrade` under load.** The route's `beforeLoad` asks
PostHog for the `migration` flag with a 1 s timeout (`get-feature-flag.ts`,
since #970) and sends the page to /dashboard when the answer is late. On
2026-10-14 PostHog took 0.4–7.3 s, and every test that opened /upgrade
stalled on "Ready to upgrade". `openMigrationFlow` now retries a bounce up to
four times. For a real user the same slowness means /upgrade silently drops
them on the dashboard; worth a product ruling on whether a late flag should
fail open, fail closed with a message, or wait longer.

**Manual bug 2 (2026-10-14) — not reproduced.** "A migrated subname with
records shows no records on its manager profile." Three real-mode tests
migrate a subname with a `description` record — registry-only (copy),
wrapped (copy) and locked (WrapperRegistry) — prove the record resolves on
chain, then open the subname's manager profile: all three show it
(`migration-subname.spec.ts`, "the manager profile after a subname copy").
Kept as regression tests. If it recurs, capture the name: the remaining
suspects are the hosted index (key inventory) or a smart-account migration.

Also seen, not yet diagnosed: in the same real-mode run the dashboard's grace
banner read "Your expired name is now in its 28-day grace period. **Renew by
—**" — the end date unformattable (`formatDashboardDate` returns `—` for an
invalid date). The banner skips V1 names, so it came from a V2 name the
account holds in grace; the app reckons grace from the wall clock while the
chain is years ahead. Needs a repro before it gets a row.

### Local Panoptes root role holders: the explorer refuses every V2 transfer (blocks explorer-driven X4, X14)

Measured 2026-10-15. The explorer's transfer page cross-checks role holders
before it lets a name be sent (`features/transfer/hooks/useTransferRoleRevocations.ts`),
including the holders at the `.eth` registry **root**, read from Panoptes in
one page of 1000 (`lib/roles/roleHolders.ts`; a longer list is `truncated`).
The local Panoptes answers that root query with 1000+ rows (886 distinct
accounts; one account 29 times); the hosted one
(`https://staging-graphql.ens.dev/`) returns 5. On chain a role allows at most
15 holders, so the local list is wrong. The page then shows "Couldn't check
who else holds permissions on this name… Refresh and try again" and keeps
**Transfer name** disabled — for every V2 name, including the explorer's own
`portal/tests/transfer.spec.ts` "transfers a name to wallet B with the
resolver detached".

A second, smaller timing issue: the explorer's per-name holder table
(`roleConnection`) fills after Panoptes' event log, so reading it right after
registration fails as `registry-mismatch`. `helpers/indexer-sync.ts`
`waitForRoleHolder` waits for it; the cross-app fixture uses it.

**Root cause (2026-10-15):** the local image is
`ghcr.io/mdtanrikulu/panoptes:latest` as pulled on 2026-04-23 (digest
`a5fd2896…`), older than the 2026-10-01 ENSv2 deployment it indexes. A clean
re-index from block 11820291 reproduces the list (852 accounts). Sampled
"root holders" show bitmap `0x1111…` — exactly the full role set a
PermissionedResolver grants its admin on `initialize` — while the registry
answers `roles(0, account) = 0` for every one: the image files resolver
`EACRolesChanged` events under the registry. There is no newer image to
pull: the ghcr package is public and its newest version, `v0.2.1` =
`latest`, is this same digest (a `denied` on pull comes from a stale ghcr
login in the Docker keychain, not from the package). The hosted Panoptes
therefore runs a build that is not published; the fix needs that build (or
a fixed release) from the Panoptes maintainer.

**Effect:** `projects/cross-app/tests/transfer-in-explorer.spec.ts` skips
itself while `explorerCanReadRootHolders` is false. The same observations run
from an on-chain transfer in `manager/tests/transfer-observers.spec.ts` (X4,
X14). **Fix:** re-index the local Panoptes from the V2 deployment block, or
move it to the image the hosted one runs, then check the root query returns
a handful of holders. (Portal e2e is parked until the portal reads bigname.)

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
docker compose -f e2e/infra/docker-compose.yml up -d --no-deps panoptes-indexer panoptes-api
```

**Keep `--no-deps`:** without it, Compose can recreate Anvil when the shell
lacks the pinned `SEPOLIA_FORK_BLOCK` used by `start-local-env.sh`, resetting
the local chain. Observed during the native 4LD pass on 2026-10-21.

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

This was a **calendar-time-dependent flake** while the stack forked live
Sepolia: every fresh fork inherited however much history had accumulated by
then. The stack now forks a pinned block (`e2e/infra/fork-block`, since
2026-10-13), so the history stops growing until the pin moves — but it was
already past the cap at the pin, so this still blocks the scenarios below
until the oracle is resource-scoped. Not re-measured at the pin (portal e2e is
parked).

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
