# ENS apps-monorepo — Master E2E Test Plan

Status: proposal · Owner: QA/e2e · Targets: `apps/manager` (3000), `apps/portal` (3001), cross-app

---

## 0. Purpose and sources of truth

This plan defines the **complete** e2e surface for the monorepo: what must be
tested, the exact oracle that decides pass/fail for each case, and the harness
work required to make each case reachable.

Three upstream repos are the input, and each one answers a different question:

| Source | What it authoritatively defines | How it feeds this plan |
|---|---|---|
| `~/ens/contracts-v2` (`contracts/test/**`) | The V2 protocol's own behaviour — registry states, role semantics, registrar/grace/premium arithmetic, migration controller acceptance rules, resolver authorization | Every contract-level branch that a **user can reach through the UI** becomes an e2e scenario. Contract unit tests are the coverage checklist; §7 maps them 1:1. |
| `~/ens/ens-app-v3` (`e2e/specs/**`) | The legacy manager app's proven UX surface — 30 specs, ~250 cases, battle-tested selectors and flake patterns | Parity checklist (§8). Anything a user could do in v3 must either have a v2 equivalent tested here, or an explicit "intentionally dropped" note. |
| `~/ens/ens-contracts` (NameWrapper, BaseRegistrar, ETHRegistrarController) | V1 ground truth — fuses, 90-day grace, 21-day premium decay, wrapped/unwrapped/emancipated token shapes | The **input state space** for migration. Every V1 token shape must have a migration case. |

Two in-repo documents are normative and this plan is written against them:

- `apps/manager/src/features/migration/MIGRATION_CASE_STUDY.md` — the migration case taxonomy
- `packages/transaction-manager/TRANSACTION_FLOW.md` — the transaction lifecycle / XState spine

---

## 1. Where we are today

**Existing specs (13 files, ~55 cases):**

| Project | Files | Coverage |
|---|---|---|
| manager | `registration`, `registration-rhinestone`, `migration`, `migration-fuses`, `migration-premium`, `profile`, `primaryName`, `temporaryPremium`, `notification` | registration (EOA + HCA), migration happy paths + 6 fuse combos, records CRUD, favourites, extend, premium windows, email notifications |
| portal | `registration`, `temporaryPremium`, `transfer` (18 cases) | registration, premium display, transfer incl. migrated V1 names |
| cross-app | *empty* (`.gitkeep`) | none |

**Harness that already exists and must be reused, not reinvented:**

- `fixtures/makeV1Name.ts` — mints V1 names as `unwrapped | wrapped | locked`, with arbitrary fuses and records; `reserveInV2()` for the premigration reservation
- `fixtures/makeV2Name.ts`, `makeName.ts`, `makeMigratedName.ts` (`unwrapped | unlocked | locked`), `makeV1Subname.ts`, `makeV1Hierarchy.ts`
- `fixtures/time.ts` — the Anvil ↔ `page.clock` lockstep clock (`sync`, `increaseTime`, `syncFixed`, `resume`). **All time-based cases depend on this.**
- `helpers/migration-assertions.ts` — on-chain oracles: `assertV2Registered/Reserved`, `assertWrapperRegistryCreated`, `assertNoSubregistry`, `assertV2Resolver`, `assertHasRoles/LacksRoles`, `assertUnlockedMigration/LockedMigration`
- `helpers/console-monitor.ts` — transaction-id oracle (`transfer-<name>-<step>` style), the most precise signal we have
- `helpers/mock-indexer.ts`, `mock-v1-subgraph.ts` — Panoptes/subgraph route mocks for CI
- `infra/` — Anvil Sepolia fork + Alto bundler + mockestrator + Panoptes, via docker-compose

**The gap in one line:** we test *that the happy path works*; we do not test
*that the protocol's rules are enforced in the UI*. Roles, resolvers, subnames,
registries, expiry/grace transitions, and every negative branch are essentially
untested, and cross-app is empty.

---

## 2. Harness work required before the scenarios below are writable

These are blockers, listed in build order. Each is a prerequisite for whole
sections of §5–§6.

| # | Item | Unblocks |
|---|---|---|
| H1 | **`makeV2Name` role parameterisation** — grant/revoke arbitrary `ROLE_*` bitmaps to arbitrary accounts at setup, plus an `assertRoleBitmap(label, account)` oracle | All of §5.C (roles), §5.D (registry), §5.E (resolver) |
| H2 | **`makeSubname` fixture** — create N-deep V2 subnames through `UserRegistry`/`WrapperRegistry`, with per-level owner and roles | §5.D, §5.F, 3LD/4LD parity (§8) |
| H3 | **Multi-wallet fixture** — ≥3 distinct funded wallets (`owner`, `manager`, `stranger`) switchable mid-test without a page reload | Every authorization negative case |
| H4 | **Deterministic time presets** — named helpers `atExpiry()`, `inGrace(dayN)`, `atGraceEnd()`, `inPremium(dayN)`, `afterPremium()` built on `fixtures/time.ts`, so windows are stated once | §5.B, §5.G, §6.B |
| H5 | **Snapshot/revert per test** — `evm_snapshot`/`evm_revert` around each test so state-heavy suites stop depending on ordering; today `workers: 1` is a correctness crutch | Parallelism, flake reduction |
| H6 | **Panoptes seeding path** — a real (not mocked) indexer fixture for tests whose oracle *is* the indexer (history tables, activity feeds, dashboards) | §5.H, §5.I, §6.D |
| H7 | **Cross-app fixture** — one browser context, two base URLs, shared wallet + shared chain state; navigate manager→portal without losing the connection | All of §6 |
| H8 | **`ConsoleMonitor` transaction-id catalogue** — a single exported map of every transaction id the apps emit, so specs assert exact step sequences rather than "some tx happened" | Precision for every write flow |
| H9 | **Error-injection helpers** — `page.route` failures for RPC/indexer/orchestrator, plus wallet-rejection and revert simulation | §5.K |
| H10 | **Premigration state builder** — put the fork in a realistic post-premigration state (all V1 names `RESERVED` in V2, `ENSV1Resolver` wildcard, V1 registration disabled) | §5.G, §6.B — the migration case study's stated assumptions |

---

## 3. The domain model the tests must cover

### 3.1 Name lifecycle (V2) — the state machine every suite navigates

```
unregistered ──reserve──▶ reserved ──register──▶ registered
                              │                     │
                              │                  expiry reached
                              ▼                     ▼
                         (premigration)         expired ──28d grace──▶ available+premium
                                                    │                        │
                                              renew (owner)            21d halving decay
                                                    │                        │
                                                registered              available (no premium)
```

`PermissionedRegistry.getState()` returns `available | reserved | registered |
expired | unregistered` — these five are the oracle for every "what does the UI
show" assertion.

### 3.2 Time windows (verified constants)

| Window | Value | Source |
|---|---|---|
| V2 grace | **28 days** | `GRACE_PERIOD_DAYS`/`V2_GRACE_PERIOD_DAYS` in `apps/manager/src/features/grace/utils/gracePeriod.ts` |
| V1 grace | **90 days** | legacy BaseRegistrar |
| V1 continuity bonus | **62 days** (`90 − 28`) | `TestnetV1PremigrationRegistrar.CONTINUITY_BONUS_PERIOD`, `ETHRenewerV1.GRACE_PERIOD = bonusPeriod + gracePeriod` |
| Temporary premium | **21 days**, exponential halving | `StandardRentPriceOracle.PREMIUM_PERIOD` / `PREMIUM_HALVING_PERIOD` / `LibHalving` |
| Commitment min/max age | registrar-configured range | `ETHRegistrar.test_register_commitmentTooNew/TooOld` |

### 3.3 Role vocabulary (from `contracts-v2/src`, verified)

Token roles: `ROLE_SET_RESOLVER`, `ROLE_SET_SUBREGISTRY`, `ROLE_RENEW`,
`ROLE_CAN_TRANSFER_ADMIN`, `ROLE_UNREGISTER`, `ROLE_SET_PARENT`,
`ROLE_UPDATE_TOKEN`, `ROLE_DISABLE_TOKEN`, `ROLE_SET_URI`, `ROLE_UPGRADE`.
Registry roles: `ROLE_REGISTRAR`, `ROLE_REGISTER_RESERVED`, `ROLE_RENEW`.
Resolver roles: `ROLE_SET_ADDR`, `ROLE_SET_TEXT`, `ROLE_SET_DATA`,
`ROLE_SET_NAME`, `ROLE_SET_CONTENTHASH`, `ROLE_SET_PUBKEY`, `ROLE_SET_ABI`,
`ROLE_SET_INTERFACE`, `ROLE_SET_ALIAS`. Every role has an `_ADMIN` counterpart;
holding the admin role is what lets you grant/revoke it.

**The universal role oracle:** for role R and UI action A gated by R —
(1) holder sees A enabled and it succeeds; (2) non-holder sees A absent or
disabled with the correct copy; (3) revoking R mid-session makes A disappear
after invalidation; (4) `ROOT`/parent authorization does **not** silently
substitute for R except where the contract says it does
(`test_safeTransferFrom_rootAuthorizationIgnored`).

### 3.4 V1 fuse → V2 role mapping (the migration oracle)

| V1 fuse burnt | V2 consequence | Test must assert |
|---|---|---|
| `CANNOT_UNWRAP` | name is **Locked**; migrates via `LockedMigrationController`; gets a `WrapperRegistry` subregistry | non-zero subregistry, `assertLockedMigration` |
| `CANNOT_BURN_FUSES` | admin roles **not** granted | `assertLacksRoles(*_ADMIN)`; UI hides grant/revoke |
| `CANNOT_TRANSFER` | `ROLE_CAN_TRANSFER_ADMIN` **not** granted | portal Transfer route shows "Transfer not available" |
| `CANNOT_SET_RESOLVER` | `ROLE_SET_RESOLVER` not granted; **V1 resolver is preserved**, not cleared | `assertV2Resolver(label, v1Resolver)`; change-resolver blocked |
| `CANNOT_CREATE_SUBDOMAIN` | `ROLE_REGISTRAR` not granted on the subregistry | portal create-subname blocked |
| `CANNOT_APPROVE` + non-null `getApproved()` | migration **reverts** `FrozenTokenApproval` | manager migration shows the unmigratable reason |
| `CAN_EXTEND_EXPIRY` | `ROLE_RENEW` granted on the token | extend offered to the name owner |
| `CANNOT_SET_TTL` | ignored | no UI effect (assert nothing breaks) |

---

## 4. Suite taxonomy and tagging

```
e2e/projects/manager/tests/     @manager
e2e/projects/portal/tests/      @portal
e2e/projects/cross-app/tests/   @cross-app
```

Orthogonal tags, applied per test: `@smoke` (PR gate, ≤8 min),
`@core` (merge gate), `@extended` (nightly), `@time` (needs clock travel),
`@migration`, `@hca` (Rhinestone path), `@eoa`, `@negative`, `@a11y`.

---

## 5. Scenario catalogue

Legend: **O** = oracle — the exact rule that decides pass/fail. IDs are stable
and are referenced by the milestones in §10.

### A. Registration (manager + portal)

| # | Scenario | O |
|---|---|---|
| A1 | Register available 2LD, 1 year, USDC — EOA path | `ConsoleMonitor` sees `deployingResolver → preparingCommitment → committingTransaction → commitmentCooldown → checkingAllowance → approvingToken → registeringDomain → success`; `getState() = registered`; expiry = now + 1y ± block skew |
| A2 | Same via **Rhinestone HCA** | stage spine `computingHcaBudget → checkingHcaFunding → signingFundingPermit → submittingSetupBundle → … → submittingRhinestoneBundle → verifyingRegistration → success` |
| A3 | Duration variants: 28 days (minimum), 1y, 2y, 5y, custom date picker | price recomputes; on-chain expiry matches selected duration exactly for each |
| A4 | Duration **below minimum** | registrar `DurationTooShort` never reached — UI blocks first (`test_register_durationTooShort`) |
| A5 | Payment token switching (each token in `paymentTokens.ts`) | quoted total changes by the oracle ratio; `isPaymentToken` false ⇒ token absent from picker |
| A6 | Insufficient balance / insufficient allowance | UI blocks or surfaces the revert; no commitment consumed (`test_register_insufficientBalance/Allowance`) |
| A7 | **Commitment too new** — reveal before min age | UI holds in `commitmentCooldown` and does not submit early |
| A8 | **Commitment too old** — advance past max age (`@time`) | UI restarts the commit leg rather than reverting |
| A9 | Commitment replay: same label+secret twice | second commit rejected (`test_commit_unexpiredCommitment`, `test_commit_consumed`) |
| A10 | Register a name that is **already registered** | search shows unavailable; register route redirects to profile |
| A11 | Register a **reserved (premigrated)** name | unavailable with the "not yet migrated" reason (`test_register_premigrated`) |
| A12 | Register during grace of an expired name (`@time`) | unavailable; renew is offered to the prior owner instead (`test_register_duringGrace`) |
| A13 | Register after grace, **inside** premium (`@time`) | available at base + premium (`test_register_afterGrace`) |
| A14 | Register after premium window (`@time`) | available at base only (`test_register_afterPremium`) |
| A15 | Label validation: <3 chars, emoji, unicode confusables, uppercase, trailing dot, unnormalised | normalisation applied or rejected with the right message (parity: `un-normalised-name.spec.ts`) |
| A16 | Register while **disconnected** | connect prompt; flow resumes at the same step after connecting (already covered — keep) |
| A17 | Wallet rejects the signature at each of: commit, approve, reveal | machine lands in `error` with a retry affordance; no orphaned commitment |
| A18 | Refresh / navigate away mid-flow, then return | resumable state restored (parity: v3 `should show resume state if wrap steps are incomplete`) |
| A19 | Post-registration auto-setup | ETH record synced then primary name set — `syncingEthRecord → waitingForEthRecordSync → settingPrimaryName → success` |
| A20 | Register with a **referrer** in the URL | referrer reaches the contract call (parity: v3 referrer suite) |
| A21 | Register 3LD directly (not migratable per case study) | offered only where the parent registry grants `ROLE_REGISTRAR` |

### B. Renewal, extension, grace (manager + portal) `@time`

| # | Scenario | O |
|---|---|---|
| B1 | Extend an owned active name by 28d / 1y / to a picked date | new expiry = old + duration; `test_renew` arithmetic |
| B2 | Extend an **unowned** name (anyone may renew) | succeeds; `test_renew_available`/`renew` is not role-gated for the base case |
| B3 | Extend a name **in grace**, day 1 and day 27 | succeeds, expiry computed from the *original* expiry, not from now (`test_renew_duringGrace`) |
| B4 | Extend **after** grace | blocked / name shown as available for registration (`test_renew_afterGrace`) |
| B5 | Renew cannot reduce expiry | UI never offers a shorter target (`test_renew_cannotReduceExpiry`) |
| B6 | Grace banner + badge appear exactly at expiry and disappear at renewal | `GracePeriodBanner`/`GracePeriodBadge`; `resolveDashboardGraceBanner` states |
| B7 | Dashboard grace banner aggregates N expiring names | count and CTA match `resolveDashboardGraceBanner` |
| B8 | **Bulk renew** 2, 5, 20 names incl. mixed active/grace | one plan, per-name line items, `BulkRenewDialog` success/failure steps; on-chain expiry advanced for every name |
| B9 | Bulk renew with one name failing | `FailureStep` lists the failure; the others still renewed |
| B10 | **Auto-renewal** enable/disable, and the renewal actually firing | approval + schedule state; `features/auto-renewal` |
| B11 | Renew deep link `/renew/$name` — connected, disconnected, unregistered name | parity: v3 `renew deep link should redirect to registration when not logged in` |
| B12 | Renew with insufficient balance/allowance | blocked with the right copy (`test_renew_insufficientBalance/Allowance`) |
| B13 | Renew a name **without** `ROLE_RENEW` where the registry requires it (subname case) | blocked (`test_renew_notAuthorized`) |
| B14 | **V1 name renewal via `ETHRenewerV1`** — active, in-grace-still-in-grace, in-grace-out-of-grace, after-grace | the four `ETHRenewerV1.test_renew_*` branches; plus `syncWrapper` for wrapped and unwrapped V1 names |
| B15 | V1 continuity bonus: renewing a V1 name inside the 62-day bonus window | expiry reflects the bonus, not a plain extension |

### C. Roles and permissions (portal, `/$name/roles`) — **largest untested area**

| # | Scenario | O |
|---|---|---|
| C1 | Roles table lists every holder of every role for a name | matches on-chain `roles()`/`hasRoles()` per account |
| C2 | Grant a single role to a second wallet | on-chain bitmap changes; the second wallet's UI gains the gated action |
| C3 | Grant several roles in one transaction | `buildRoleTransactions` emits one batched call; bitmap matches exactly |
| C4 | Revoke a role | bitmap cleared; the grantee's action disappears after query invalidation |
| C5 | Grant/revoke **without** the corresponding `_ADMIN` role | action hidden; direct navigation shows not-authorized (`test_revokeRoles_asOwnerLackingAdmin`) |
| C6 | Owner **with** admin vs **root** performing the same grant | both succeed (`test_grantRoles_withAdminAsOwner`, `test_grantRoles_asRoot`) |
| C7 | Roles while the name is **expired** | grant/revoke behaviour matches `test_grantRoles_whileExpired` / `test_revokeRoles_whileExpired` |
| C8 | Roles while the name is **reserved** | matches `test_grantRoles_whileReserved` |
| C9 | `setApprovalForAll` operator gains the blended role set | operator can `setResolver`/`setSubregistry` (`test_setApprovalForAll_setResolver/_setSubregistry/_blendedRoles`); revoking approval removes them |
| C10 | Max-assignee boundary | UI surfaces the cap (`test_transferWithMaxAssignees`) |
| C11 | Role history table | every grant/revoke appears with actor + block, in order (`RoleHistoryTable`, `useRegistryRoleHistoryForAccount`) |
| C12 | Roles survive a transfer / are reset by it | `test_transferAbortsAfterRevoke`, `test_transferRegistryControl` — assert the post-transfer bitmap the contract specifies |
| C13 | Registry-level roles (`/registry/$address/roles`) vs name-level roles | the two tables are independent; granting one does not grant the other |
| C14 | Resolver-level roles (`/resolver/$address/roles`) | per-profile-key authorization (`test_authorizeTextRoles`, `..AddrRoles`, `..DataRoles`, `..NameRoles`) incl. the `anyName` variants |

### D. Registry / subnames (portal `/$name/registry`, `/$name/subnames`, `/registry/$address`)

| # | Scenario | O |
|---|---|---|
| D1 | Deploy a subregistry for a name that has none | `getSubregistry()` non-zero; `MigrateRegistryPrompt` → `RegistryInfo` |
| D2 | Create a subname (3LD) | appears in `SubnamesTable` and on-chain in the subregistry; `getState() = registered` |
| D3 | Create a 4LD under a 3LD that owns its own registry | nested registry resolution correct (parity: `ownership.4LD.spec.ts`) |
| D4 | Create a subname **without** `ROLE_REGISTRAR` | blocked (`test_Revert_unauthorized_registration`) |
| D5 | Delete a subname | `unregister` succeeds; row disappears; `test_unregister_registered` |
| D6 | Delete without `ROLE_UNREGISTER` | blocked (`test_unregister_notAuthorized`) |
| D7 | Subname expiry cannot exceed the parent's | `test_domain_expiry`, `test_register_cannotSetPastExpiry` |
| D8 | Parent expires → children behaviour | children unresolvable; UI shows the parent-expired reason |
| D9 | `setSubregistry` / detach registry | `test_setSubregistry`, `..._notAuthorized`, `..._whileReserved` |
| D10 | Registry labels table + label count | matches on-chain enumeration (`useRegistryLabels`, `useRegistryLabelCount`) |
| D11 | Registry tree navigation, ≥3 levels | `RegistryTree` renders the real hierarchy; each node links to its own page |
| D12 | Registry history / events table | `useRegistryEvents` rows match emitted events |
| D13 | Registry add/edit user sheets | grant/revoke through `RegistryAddUserSheet`/`RegistryEditUserSheet` reaches chain |
| D14 | Registry upgrade path | `test_upgrade` / `test_Revert_unauthorized_upgrade`; `ApprovedUpgradeGate` rejects unapproved targets |

### E. Resolvers and records (both apps)

| # | Scenario | O |
|---|---|---|
| E1 | Set/update/delete text records (multiple keys in one save) | on-chain `text()` matches; `PendingChangesBar` step count = number of changed keys |
| E2 | Set addresses for multiple coin types incl. EVM and non-EVM | `addr()` per coinType; zero-address fallback rules (`test_setAddr_zeroEVM_fallbacks`) |
| E3 | Invalid address input: too short / too long / wrong checksum | rejected client-side (`test_setAddr_invalidEVM_tooShort/tooLong`) |
| E4 | Contenthash, pubkey, ABI, interface | each set + read back; ABI content-type validation (`test_setABI_invalidContentType_*`) |
| E5 | Record edits **without** the per-key role | blocked (`test_setText_notAuthorized` etc.) |
| E6 | Change resolver (`/$name/change-resolver`) | `getResolver()` updated; records read through the new resolver |
| E7 | Change resolver blocked when `ROLE_SET_RESOLVER` absent (incl. migrated `CANNOT_SET_RESOLVER` names) | button hidden / route guarded |
| E8 | Detach resolver (set to zero) | `getResolver() = 0`; profile shows the no-resolver state |
| E9 | Resolver **aliases** (`/resolver/$address/aliases`, `create-alias`) | the five alias modes: none, root, exact, subdomain, recursive (`test_alias_*`) |
| E10 | Alias creation without `ROLE_SET_ALIAS` | blocked (`test_alias_notAuthorized`) |
| E11 | Resolver nodes list + node detail sheet | `/resolver/$address/nodes` matches on-chain node set |
| E12 | Multicall record save — partial failure | `test_multicall_getters_partialError` semantics surfaced, not silently swallowed |
| E13 | Wildcard / `ENSV1Resolver` fallback for an unmigrated name | resolution still returns V1 data (case study: "ENSV1Resolver will resolve until expired in ENSv2") |
| E14 | Resolver upgrade (`test_upgrade`, `canUpgradeFrom`) | admin-only; post-upgrade records intact |
| E15 | Records on a name whose resolver is a **V1 PublicResolver** (post-migration, `CANNOT_SET_RESOLVER`) | reads work; writes gated correctly |

### F. Ownership and transfer (portal)

Existing `transfer.spec.ts` (18 cases) covers the core. Additions:

| # | Scenario | O |
|---|---|---|
| F1 | Transfer each **migrated** V1 type: unwrapped, unlocked, locked | plan step count per the `buildTransferPlan` table in `transfer-web446-test-plan.md`; locked name must not offer a `detach-registry` step it cannot execute |
| F2 | Transfer with `CANNOT_TRANSFER` burnt in V1 | route shows "Transfer not available" (no `ROLE_CAN_TRANSFER_ADMIN`) |
| F3 | Transfer of a **subname** | currently unsupported — assert the explicit unsupported copy, and flip this test when support lands |
| F4 | Transfer while the name is **expired** | `test_transferWhileExpired` behaviour reflected in UI |
| F5 | Transfer to a contract that is not a valid receiver | `test_safeTransferFrom_invalidReceiver` surfaced as an error, not a hang |
| F6 | Batch transfer (multiple names) | `test_safeBatchTransferFrom*` incl. the one-error-aborts-all case |
| F7 | Transfer then role check | new owner holds the roles the contract grants; old owner holds none |
| F8 | Manager/owner split — "sync manager" equivalent | parity: v3 `Sync Manager`; assert the V2 equivalent (registry control vs token owner) |

### G. Migration V1 → V2 (manager) — the deepest matrix `@migration @time`

Driven by `MIGRATION_CASE_STUDY.md` §Migration Cases and the
`Locked/UnlockedMigrationController` + `MigrationHelper` + `Graveyard` unit tests.

**G-a. Token-shape matrix** — every row is one test:

| # | V1 shape | Receiver | Post-state oracle |
|---|---|---|---|
| G1 | Unwrapped 2LD | `UnlockedMigrationController` (ERC-721) | reclaimed on BaseRegistrar, resolver cleared, token in `Graveyard`, V2 `registered` with registrar-equivalent roles |
| G2 | Unlocked (wrapped, no `CANNOT_UNWRAP`) 2LD | `UnlockedMigrationController` (ERC-1155) | unwrapped to `Graveyard`, `NameWrapper` is ENSRegistry owner, resolver cleared |
| G3 | Locked 2LD | `LockedMigrationController` | **not** unwrapped, controller holds token, `WrapperRegistry` deployed as subregistry (`assertWrapperRegistryCreated`) |
| G4 | Locked 3LD (child of a migrated locked parent) | that parent's `WrapperRegistry` | `_inject()` path, expiry copied from the locked token |
| G5 | Detached 3LD (emancipated, not locked, locked parent) | parent's `WrapperRegistry` | unwrapped to `Graveyard`, registered in parent registry |
| G6 | Emancipated 3LD whose **parent has not migrated** | none | UI marks it unmigratable with the "parent must migrate first" reason |
| G7 | Unlocked 3LD | none | not migratable — must be registered directly (case study §Unlocked.4) |
| G8 | Batch: 7 unwrapped + 8 unlocked + 9 locked | `MigrationHelper` | all 24 migrated in one flow (`test_migrate_7unwrapped_8unlocked_9locked`) |
| G9 | Parent + children in one batch | ordering enforced — parent first (`test_migrate_parentAndChildren`, `..._parentNotMigrated`) |

**G-b. Fuse matrix** — extends the existing 6 cases to the full set from §3.4:
`CANNOT_BURN_FUSES`, `CANNOT_TRANSFER`, `CANNOT_SET_RESOLVER`,
`CANNOT_CREATE_SUBDOMAIN`, `CAN_EXTEND_EXPIRY`, `CANNOT_APPROVE`,
`CANNOT_SET_TTL`, and the all-fuses-burnt combination. **O**: the granted V2
role bitmap equals the mapping table exactly (`assertHasRoles`/`assertLacksRoles`),
and the corresponding portal UI affordance is present/absent to match.

**G-c. Unmigratable matrix** — each must show a *distinct, correct* reason:

| # | Cause | O |
|---|---|---|
| G10 | Not the owner / not approved | `test_migrate_*_notApproved`, `..._notOperator` |
| G11 | Owner mismatch between wrapper and registrar | `test_migrate_notSameOwner*` |
| G12 | `CANNOT_TRANSFER` burnt | reason copy names the fuse |
| G13 | `CANNOT_APPROVE` + non-null approval | `FrozenTokenApproval` (`test_migrate_frozenTokenApproval`) |
| G14 | Name data mismatch (label ≠ tokenId) | `NameDataMismatch` — reachable only via crafted input; assert the app never constructs it |
| G15 | Not reserved in V2 (premigration missing) | `test_*_notReserved` |

**G-d. Time-based migration** (extends `migration-premium.spec.ts`):

| # | Scenario | O |
|---|---|---|
| G16 | Migrate an active name | baseline (exists) |
| G17 | Migrate at day 45 of V1 grace | succeeds; V2 expiry preserves V1 expiry |
| G18 | Migrate at day 89 of V1 grace (edge) | succeeds |
| G19 | Migrate after V1 grace (expired) | not offered; name shown as available/premium |
| G20 | Prior owner renews inside the 62-day continuity bonus without premium | exists — extend to day 61 and day 63 boundaries |
| G21 | Unmigrated name after V1 expiry | registry frozen: owner + resolver frozen, `ENSV1Resolver` resolves until V2 expiry; `Graveyard.clear()` reachable |

**G-e. Migration UX**

| # | Scenario | O |
|---|---|---|
| G22 | Migration dashboard lists exactly the V1 names the wallet can migrate, with correct per-name status | matches on-chain `checkIfMigrated` + migratability rules |
| G23 | Records preserved through migration (exists) — extend to addresses, contenthash, ABI | each read back post-migration |
| G24 | Edit profile immediately after migration (exists) | keep |
| G25 | Commemorative NFT flow (`migration_.nft`, `features/migration/commemorative-nft`) | minted/shown per its own rules |
| G26 | Migration idempotence — attempt to migrate an already-migrated name | blocked with "already migrated" |
| G27 | Migration interrupted mid-batch (close tab, reload) | resumable; no partial-state corruption |

### H. Profile, dashboard, search, history (both apps)

| # | Scenario | O |
|---|---|---|
| H1 | Profile page for: active, grace, expired, unregistered, reserved, subname, migrated-locked | correct badge/banner/CTA set per state |
| H2 | Dashboard lists owned names — V1 only, V2 only, mixed (`mergedNames`, `useDashboardV1Names`, `useOwnedDomains`) | list = union, deduped, correct protocol badge each |
| H3 | Dashboard pagination + sorting + filtering | `pagination.ts` boundaries at page 1, N, N+1 |
| H4 | Search: exact name, partial, address, invalid, unnormalised, already-owned | `buildSearchSuggestions` / `searchResultsUtils` categories |
| H5 | Address page `/addr/$addr` — names, resolution, reverse-resolution, history tabs | each tab's data matches chain/indexer |
| H6 | Name history `/$name/history` | events in order with correct actors (needs H6 harness item — real indexer) |
| H7 | Favourites add/remove, incl. a name not owned (exists) | keep |
| H8 | Primary name set/unset, and the L2/reverse-registrar variants | `useSetReverseResolution`, `useSetL2ReverseName`, `useEnsureL2Connection` — incl. wrong-network → switch prompt |
| H9 | Forward vs reverse resolution mismatch display | `useReverseMatch` flags the mismatch |
| H10 | Token page `/$name/token` | tokenId, uri, renderer (`test_uri_unset`, `test_setURI_withRenderer`) |
| H11 | TLD page `/tld/$tld` | non-`.eth` TLD handling incl. DNS TLDs (`DNSTLDResolver`) |

### I. Fuses view (portal `/$name/fuses`, `/$name/fuses/burn`)

| # | Scenario | O |
|---|---|---|
| I1 | Fuse list for a V1 wrapped name shows exactly the burnt fuses | `isFuseBurnt`, `useBurnedFuseCount` vs on-chain |
| I2 | Burn a fuse | on-chain fuse set; irreversibility warning shown first |
| I3 | Burn blocked by `CANNOT_BURN_FUSES` | action absent |
| I4 | Parent-controlled fuses vs child-controlled | parity: v3 `permissions.spec.ts` — PCC burn, extend-expiry grant, parent-vs-owner button sets |
| I5 | Fuses view for a **V2** name | shows the role model instead, not fuses (no false V1 UI) |

### J. Wallet, auth, network

| # | Scenario | O |
|---|---|---|
| J1 | Connect / disconnect / reconnect; state survives reload | connection persisted |
| J2 | Account switch mid-session | all name-scoped queries invalidated (`useResetMutationsOnAccountChange`); permissions re-evaluated |
| J3 | Wrong network → switch prompt → success | chain guard |
| J4 | SIWE backend auth modal: sign, dismiss, expire | `manager-auth.ts` helpers; notifications routes are `_authenticated` |
| J5 | EOA vs Rhinestone HCA parity for register / renew / transfer | same end state, different stage spine |
| J6 | HCA funding: insufficient funding, permit rejected, bundle reverts | each surfaces a distinct actionable error (`DEBUGGING_INTENTS.md`) |
| J7 | Notifications: email verify, welcome, settings, inbox | exists for verify — extend to settings + inbox |

### K. Failure, resilience, and edge (`@negative`)

| # | Scenario | O |
|---|---|---|
| K1 | RPC returns 500 / times out mid-flow | error state with retry; no silent success |
| K2 | Indexer (Panoptes) down | app degrades to on-chain reads; lists show the degraded state, not a crash |
| K3 | Orchestrator (mockestrator) down on the HCA path | actionable error |
| K4 | Transaction reverts on-chain after submission | machine reaches `error`, surfaces the revert reason |
| K5 | Chain reorg / dropped tx (replace with a higher-nonce tx) | UI recovers |
| K6 | Two tabs performing conflicting writes on the same name | last-write-wins, no corrupted local state |
| K7 | Slow network (throttled) — no double-submit on double-click | one transaction only |
| K8 | Browser back/forward through every multi-step flow | no orphaned state |
| K9 | Deep link to every route while disconnected | connect prompt, then resume at the target |
| K10 | Console error budget | zero unhandled errors/rejections per test (`console-monitor.ts` already has the hook) |

### L. Cross-cutting quality

- **L1 i18n** — manager ships `en, de, es, ru, sv`: smoke each locale on register + profile; assert no missing-key markers and no layout overflow.
- **L2 a11y** — axe scan on every top-level route in both apps; keyboard-only completion of register, transfer, and role-grant.
- **L3 Responsive** — mobile viewport for dashboard, profile, register, transfer (`NameMobileCard` path).
- **L4 Performance budget** — time-to-interactive per route recorded as a trend, failing only on large regressions.

---

## 6. Cross-app suite (currently empty — highest structural gap)

The two apps share chain state, an indexer, and a wallet. Cross-app tests assert
they agree.

| # | Scenario | O |
|---|---|---|
| X1 | Register in **manager** → open the same name in **portal** | portal shows the same owner, expiry, resolver, registry, and roles |
| X2 | Migrate in manager → inspect in portal | portal shows the V2 registry/subregistry, correct role set per fuse mapping, and (locked) the `WrapperRegistry` |
| X3 | Grant a role in **portal** → the grantee's manager UI gains the action | permission propagation across apps |
| X4 | Transfer in portal → manager dashboard of the old owner drops the name, new owner's gains it | indexer + on-chain agreement |
| X5 | Edit records in manager → portal records table shows the same values (and vice versa) | resolver reads agree |
| X6 | Extend in manager → portal expiry, grace badge, and premium state update | shared time semantics |
| X7 | Create a subname in portal → it appears in manager's name tree/dashboard | |
| X8 | Set primary name in manager → portal reverse-resolution tab reflects it | |
| X9 | Same name, two apps, two wallets simultaneously | no cache bleed between contexts |
| X10 | Version disagreement: a name mid-migration | both apps show a consistent "migrating" state, never one V1 and one V2 |

---

## 7. Traceability: contracts-v2 unit tests → e2e scenarios

Only branches a user can reach through the UI are listed; the rest stay
contract-side. This table is the **completeness check** — a new contract test
without a row here is an intentional decision, not an oversight.

| Contract test file | Reachable branches | e2e IDs |
|---|---|---|
| `PermissionedRegistry.t.sol` | register/reserve/renew/unregister state matrix, transfer + approval, role grant/revoke incl. expired & reserved, subregistry/resolver setters, URI | A10–A12, B1–B5, C1–C13, D1–D14, F4–F7, H10 |
| `ETHRegistrar.t.sol` | commit/reveal ages, availability across grace/premium, balance & allowance, duration bounds, premigrated | A1–A14, B12 |
| `StandardRentPriceOracle.t.sol` | premium decay curve, payment tokens, discounts, price computation | A3, A5, A13–A14, G20 |
| `ETHRenewerV1.t.sol` | V1 renewal in/out of grace, `syncWrapper` wrapped & unwrapped | B14, B15 |
| `UnlockedMigrationController.t.sol` | unwrapped & unlocked migration, via-approval, batch, invalid owner/receiver/data | G1, G2, G8, G10–G15 |
| `LockedMigrationController.t.sol` | locked migration, locked resolver/transfer/fuses, children (locked, detached, unwrapped, abandoned), frozen approval, extend-expiry | G3–G5, G-b (all), G13 |
| `MigrationHelper.t.sol` | mixed batches, parent-and-children ordering, approval/operator checks | G8, G9, G10, G11 |
| `Graveyard.t.sol` | clearing expired/unmigrated namespaces, nested & detached cases | G21 |
| `UserRegistry.t.sol` | subname registration, role management, expiry bounds, upgrade | D2–D7, D14 |
| `PermissionedResolver.t.sol` | per-key authorization, aliases, all record setters, multicall, versions, upgrade | E1–E14 |
| `UniversalResolverV2.t.sol` / `LibRegistry.t.sol` | resolution across registries incl. wildcard | E13, H5, X5 |
| `L2ReverseRegistrar*.t.sol` | reverse/primary name on L2 | H8 |
| `DNSTLDResolver.t.sol` | DNS-backed TLDs | H11 |
| `StandaloneSingleOwnerHCA` / `HCA*Validator.t.sol` | smart-account signing, funding session | A2, J5, J6 |
| `ApprovedUpgradeGate.t.sol` | registry upgrade gating | D14 |

---

## 8. Parity checklist: ens-app-v3 → apps-monorepo

For each legacy spec: **port** (equivalent exists), **adapt** (V2 changes the
semantics), or **drop** (feature intentionally gone). Nothing may be left blank.

| v3 spec | Disposition | Target |
|---|---|---|
| `registerName`, `registerName-metamask` | port | A1–A21 |
| `extendNames`, `extendName-metamask` | port | B1–B13 |
| `createSubname`, `deleteSubname`, `subName-metamask` | adapt (registry model) | D2–D6 |
| `ownership.spec`, `.2LD`, `.3LD`, `.4LD` | adapt (roles replace manager/owner split) | C1–C14, D3, D11, F8 |
| `permissions.spec` | adapt (fuses only for V1/migrated) | I1–I5, G-b |
| `wrapName` | drop for V2 names; keep as **V1 pre-migration state builder** | fixtures |
| `updateResolver` | port | E6–E8 |
| `advancedEditor`, `profileEditor`, `profile`, `address` | port | E1–E5, H1 |
| `setPrimary`, `settings-primary-name`, `more-tab-primary-name` | port | H8 |
| `myNames`, `addressPage` | port | H2–H5 |
| `desyncedName` | adapt — the V2 analogue is registry/resolver desync after a partial transfer | F1, X10 |
| `un-normalised-name` | port | A15 |
| `dnsclaim` | adapt | H11 |
| `_importName` | drop (superseded by migration) | G* |
| `safe-ens-with-metamask` | adapt → Rhinestone HCA | A2, J5, J6 |
| `settings` | port | J1–J4 |

---

## 9. Execution model

- **Infra**: `pnpm e2e:infra:up` (Anvil fork + Alto + mockestrator + Panoptes). Snapshot image (`Dockerfile.anvil-snapshot`) for fast CI boot.
- **Isolation**: H5 snapshot/revert per test; then lift `workers: 1` for the non-time suites. Time-travelling suites (`@time`) stay serial in their own project, as `premium.config.ts` already does.
- **Gates**: `@smoke` on every PR (≤8 min) · `@core` on merge to main · full `@extended` + `@a11y` nightly · migration matrix nightly (long-running).
- **Flake policy**: retries only on CI (already configured); any test retried twice in a week is quarantined to `@extended` with an issue, never silently re-run.
- **Oracles first**: prefer, in order — (1) on-chain read via `helpers/anvil-client`, (2) exact `ConsoleMonitor` transaction id, (3) `getByRole`/`getByTestId`, (4) text. Never assert on text alone for a state that is readable on-chain.
- **Artifacts**: trace/video/screenshot on failure (configured); plus the on-chain state dump for `@migration` failures.

---

## 10. Milestones

| Phase | Content | Cases (approx.) |
|---|---|---|
| **P0 — Harness** | H1–H10 | 0 new tests; unblocks everything |
| **P1 — Protocol core** | §5.C roles, §5.D registry/subnames, §5.E resolvers | ~55 |
| **P2 — Lifecycle** | §5.A gaps, §5.B renew/grace/bulk/auto | ~45 |
| **P3 — Migration matrix** | §5.G (a–e) | ~35 |
| **P4 — Cross-app** | §6 | ~10 |
| **P5 — Surfaces** | §5.F gaps, §5.H, §5.I, §5.J | ~40 |
| **P6 — Resilience & quality** | §5.K, §5.L | ~25 |

Total target: **~210 new cases** on top of the existing ~55.

**Definition of done for the whole plan:** every row in §7 and §8 has at least
one passing e2e case or a written, reviewed exemption.
