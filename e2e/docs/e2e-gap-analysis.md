# E2E gap analysis: why manual testing found what the suite did not

_2026-10-15. Prompted by three manager bugs found by manual testing on
2026-10-14 that ~700 catalogued scenarios and a green suite did not catch.
Inputs: this repo, `ens-app-v3`, `ens-contracts`, `contracts-v2`, `ensjs`.
Companion to [`e2e-test-catalogue.md`](./e2e-test-catalogue.md) (the what)
and [`e2e-build-goal.md`](./e2e-build-goal.md) (the how)._

**Summary.** None of the three bugs is exotic. All three live in the
**manager's derived views** — who appears in My Names and with which tag,
who may edit a profile, which names are primary-name candidates, what a
profile page shows — **after a state change made somewhere else**. The suite
verifies each state change thoroughly on chain and in the app that made it,
then stops. Nothing re-observes the result from the other app or from the
other people the change affects. The catalogue already names the missing
tests (X4, X14, R8); the build order never reached them, and the planning
method had no rule that would have forced them earlier.

---

## 1. The three bugs

Manager paths below are under `apps/manager/src` (identical on
`e2e-tests-coverage` and the bigname-harness worktree).

### Bug 1: a transferred-away V2 name stays in the sender's My Names as "Manager"

**Repro.** A registers `rgkk.eth`, transfers it to B in the explorer with the
resolver detached. Reload the manager as A: the name is still listed, tagged
"Manager" only, and no action works. (Also check B's list.)

**Expected (oracle).** An ENSv2 transfer moves **every** registry role the
sender holds on the name to the recipient: `PermissionedRegistry._update`
calls `_transferRoles(resource, from, to, false)`
(`contracts-v2/contracts/src/registry/PermissionedRegistry.sol:480-498`),
which revokes all of `from`'s roles and grants the same bitmap to `to`
(`contracts-v2/contracts/src/access-control/EnhancedAccessControl.sol:226-242`).
After a plain transfer A holds nothing on the name, so the name must leave
A's list. "Manager" as a separate holder is a V1 idea (registrant vs registry
controller, which ens-app-v3's send flow could move separately —
`ens-app-v3/src/transaction-flow/input/SendName/utils/getSendNameTransactions.ts:30-60`);
ENSv2 has no such split.

**Where the tag comes from.**
- The dashboard asks bigname for `relation: 'any'` (owner + manager +
  role_holder), for the EOA and the smart account
  (`packages/indexer/bigname/namesForAddress.ts:43`,
  `features/dashboard/service/queries/getDashboardNames.ts`).
- `toNameRoles` turns `manager` **or** `role_holder` into the "Manager" tag
  (`features/dashboard/dashboardNames.ts:50-57`), and `mergeDashboardNames`
  unions tags across addresses and protocols.
- The profile page allows actions to the token owner only (Bug 3 below), so
  a Manager-only row offers nothing.

**Open: which relation is stale.** Candidates, to settle with bigname
`/v1/addresses/{A}/names` during the repro:
1. roles held by A's *other* address (EOA vs smart account) — `_transferRoles`
   moves only the sender's roles;
2. a grant A made to itself or its other address earlier (e.g. the
   migration's `ROLE_SET_RESOLVER` grant to the manager address,
   `features/migration/service/buildAtomicMigrationBatches.ts:924-955`);
3. a stale V1 `manager` row merged by namehash;
4. bigname not yet reflecting the revoke.

### Bug 2 (possibly a false positive): a migrated subname's records do not show on its profile

**Repro.** Migrate a V1 subname that has records; open its manager profile.

**What we know.**
- The profile page reads a fixed set of common keys **on chain** through
  ensjs `getRecords` (via the UniversalResolver), plus whatever extra keys
  bigname lists (`features/profile/service/profileRecords.ts:58-121`). An
  empty bigname inventory alone cannot blank the page.
- The suite proves migrated subname records **resolve** on chain after the
  copy and the locked-child route (GR2, `migration-subname.spec.ts:599-661`;
  GS tests via `helpers/resolve-records.ts` `expectRecordsResolve`). No test
  opens the manager profile afterwards.

So either the page's read path fails for these names, or the manual case
took a route where records really were not carried (`keep-v1`, no
`v1ResolverAddress`, empty `seen_*` skipping the profile fetch —
`features/migration/service/buildMigrationPlan.ts:101-125`,
`computeMigrationPreflight.ts:127-172`). **Repro first** on the seeded grid
(`scripts/seed-subname-grid.ts`, cases 1, 2, 7, 8 carry records), comparing
`scripts/check-name-resolves.ts` with the profile page.

### Bug 3: after transferring with the resolver and ETH record kept, the sender loses edit and primary-name rights in the manager

**Repro.** A owns `fox-1.eth` with an ETH record pointing at A. In the
explorer, transfer to B keeping the resolver and ETH record. As A in the
manager: the name is not editable and is gone from the primary-name picker.
The explorer shows A's rights correctly.

**Verified on Sepolia (2026-10-15)** for `fox-1.eth`, A =
`0xF7C5572Deeac120A7DfCEBF60EBE0358Fd33d063`:
- its resolver is `0xD2C8e0e4e0843f216781A63b39Acb7C20281F64a`, an ERC-1967
  proxy (implementation `0x115eb53f…2b2c`) — A's own PermissionedResolver,
  not a shared ensjs contract;
- A holds every root role on it: `roles(0, A) = 0x1111…1111`;
- `addr(60)` through the UniversalResolver = A.

**Expected (oracle).**
- **Editing records.** A PermissionedResolver keeps its own roles, separate
  from the registry token. Setters check roles on the resolver
  (`onlyPartRoles`, `contracts-v2/contracts/src/resolver/PermissionedResolver.sol:178-187`;
  matrix at `:65-85`), so A can still write records; B cannot until A grants
  B roles or B points the name at another resolver (B holds
  `ROLE_SET_RESOLVER` after the transfer).
  Contrast `PublicResolverV2`, whose writes follow the registry owner
  (`PublicResolverV2.sol:174-184`): there, B edits and A does not. The right
  answer depends on the resolver, so the app must ask the resolver.
- **Primary name.** Setting a primary name checks nothing about ownership
  (`contracts-v2/.../L2ReverseRegistrar.sol:98-101`;
  `ens-contracts/.../DefaultReverseRegistrar.sol:26-28`); a primary name is
  *valid* when the name's `addr(60)` equals the address, checked at read time
  (`ens-contracts/contracts/universalResolver/AbstractUniversalResolver.sol:245-272`,
  `ReverseAddressMismatch`). ens-app-v3 offers such names as primary
  candidates: `isResolvedOrManagedName = owner || wrappedOwner ||
  resolvedAddress` (`ens-app-v3/src/utils/checkAvailablePrimaryName.ts:17-19,46-54`;
  e2e `ens-app-v3/e2e/specs/stateless/setPrimary.spec.ts:25`, "unmanaged name
  that has eth record set to address").

**Root cause.**
- Edit is gated on token-owner equality only:
  `features/profile/components/view/ProfileActions.tsx:73-74`
  (`canEditProfile = isOwner && …`), `ProfileView.tsx:44-55`,
  `ProfileEditAction.tsx:37`.
- Primary candidates are owned V2 names only:
  `features/dashboard/service/queries/getPrimaryNameDomains.ts:25-35`
  (`relations: ['owner'], protocol: 'v2'`).
- A resolver write probe already exists and could replace the owner check:
  `features/profile/service/resolverWriteAccess.ts:27-83` (used today only by
  the primary-name dialog). bigname offers a `resolves_to` relation that
  would cover ETH-record-only candidates.

**Product question.** ens-app-v3 required owner **and** an authorised
resolver to edit (`ens-app-v3/src/hooks/abilities/utils/getEditAbilities.ts:61-98`);
v2's PermissionedResolver deliberately allows a non-owner role holder. Which
the manager should follow needs a ruling — but hiding a right A really has,
while the explorer shows it, is wrong either way.

---

## 2. Why the suite missed them

Seven causes. The first three are about *what* we planned; the rest about
*how* we checked.

### 2.1 Every state change is verified only in the app that made it

The transfer tests (`projects/portal/tests/transfer.spec.ts`, F*) check the
chain and the explorer, never the manager. Two build Bug 3's state exactly
and stop:
- `:550` "keeps the resolver and registry attached when both detach options
  are turned off" — asserts resolver and subregistry unchanged, recipient
  owner; A is never looked at again.
- `:702` "repoints the ETH address at the recipient when the resolver is
  kept" — its comment (`:767-768`) states the sender "can no longer claim it
  as a primary name", but nothing checks it.

`transfer-web446-test-plan.md` scopes itself explicitly to the explorer, "not
the manager" (`:4`).

### 2.2 The cross-app suite was catalogued and never built

`projects/cross-app/tests/` is empty and its fixture (HW7,
`fixtures/playwright.cross-app.fixture.ts`) does not exist. All sixteen
cross-app scenarios (`coverage/scenarios.ts:1619-1710`, `:2338+`) are
not-started, including:
- **X4** — transfer in the explorer; both parties' manager dashboards update
  ("old owner loses it, new owner gains it"). **This is Bug 1.**
- **X14** — detach a resolver in the explorer; the manager profile reflects
  it.
- **X5** (records edited in one app agree in the other), **X8** (primary set
  in the manager, reverse resolution in the explorer).

Related manager rows, also not-started (`docs/e2e-coverage.md:552-584`):
**R8 "Primary name for a name that later transfers" (Bug 3)**, H2 (dashboard
lists owned names), H4 (role-derived columns), R1/R10 (set primary), N9
(transfer notification).

The build order is by risk tier (R0 irreversible first). Cross-app rows sit
in lower tiers, so they waited — but a wrong *view* of who holds a name is
what makes a user act wrongly on an irreversible step. Tiering by the
action's severity under-ranks the views users decide from.

### 2.3 The actor model has no "before" and "after"

The catalogue's actor axis (Part 2: owner, role holder, operator, V1
manager, stranger, disconnected) describes who acts. It has no
**previous owner**, **new owner**, **residual role holder**, **ETH-record
holder** or **resolver-role holder** — the people a state change leaves
behind. And there is no rule that a change is observed from each of them.
That is the exact shape of Bugs 1 and 3: correct on chain, correct for the
actor, wrong for the person on the other side.

### 2.4 The mock and the unit tests encode the app's own assumptions

- The manager dashboard tests run on the bigname **mock** with hand-written
  relations (`projects/manager/tests/dashboard-names.spec.ts`, e.g.
  `relations: ['manager']`). They test that the app renders what it is
  given, never that what bigname reports after a real transfer is right.
- Unit tests pin the buggy behaviour as intended:
  - `features/dashboard/dashboardNames.test.ts:67-76` — "maps … a role holder
    to manager";
  - `features/profile/components/view/ProfileEditAction.test.tsx` — "hides
    editing for non-owners";
  - `features/dashboard/service/queries/getPrimaryNameDomains.test.ts` —
    candidates are owner-only.
  None cites a contract rule or ens-app-v3 behaviour, so nothing told the
  author the rule was wrong.

### 2.5 Chain-first oracles stopped at the chain

The build goal ranks oracles chain-first, which is right for *what
happened*. But for derived views the user's screen **is** the outcome. The
migration record tests (GR1–GR13, GS copy tests) prove records resolve
through the UniversalResolver and never read the manager profile page —
Bug 2's blind spot.

### 2.6 The invariants were defined and never run

Catalogue Part 4 defines INV1–INV5. Three would have caught these:
- **INV3 totality** (every input in exactly one visible bucket, dashboard
  included),
- **INV4** (no confident negative without an on-chain cross-check — "not
  editable" while the resolver says A may write),
- **INV5** (every offered affordance is executable by the connected wallet —
  a listed name with a tag and no working action).

`docs/e2e-coverage.md` reports **0 of 32** invariant sites checked; no spec
carries an `@inv:` tag.

### 2.7 The reference repos were mined for flows, not for oracles

`e2e-build-goal.md` §3 uses `contracts-v2` test names and ens-app-v3's e2e
specs as **completeness checklists** — which flows exist. Their **oracle
tables** — who holds what after an action, who may do what — were not
carried over:
- ens-app-v3: `src/hooks/ownership/useRoles/utils/getRoles.ts` (role model),
  `src/hooks/abilities/utils/get{Edit,Send,Delete,Reclaim}Abilities.ts` and
  their tests, `src/utils/checkAvailablePrimaryName.ts` and its test, and
  e2e `ownership.spec.ts`, `ownership.2LD.spec.ts`, `setPrimary.spec.ts`,
  `profileEditor.spec.ts`, `myNames.spec.ts`, `permissions.spec.ts`
  (`ens-app-v3/e2e/specs/stateless/`). `setPrimary.spec.ts` alone has the
  ETH-record-only and owner-not-manager cases.
- contracts-v2: `_transferRoles` (roles move wholesale), PermissionedResolver
  roles (independent of the token), PublicResolverV2 (owner-gated).
- ensjs: `getNamesForAddress` relation filters (`owner`, `registrant`,
  `wrappedOwner`, `resolvedAddress`) — the v1 list semantics the manager's
  list replaces.

### Also: PASS means "a tagged test exists"

The coverage ledger marks a scenario PASS when a tagged test exists, not
when it was seen green (`e2e-defects.md`: no way to produce the results file
locally). Several PASS rows fail in real mode today (grace tests, GS18, B2,
B5). A ledger that cannot see red overstates what is covered.

---

## 3. Revised planning method: the observer matrix

Add a third generated matrix next to the V1 shape matrix (`e2e/matrix/`,
`scripts/generate-v1-matrix.ts`): **action × actor × view**, one cell per
"after this action, this person sees this in this place".

**Actions** (state-changing, from the catalogue):
- transfer — detach resolver / keep resolver + ETH / keep resolver, repoint
  ETH / detach registry;
- role grant, role revoke (registry and resolver);
- setResolver; record edit;
- migrate — each route (token, copy, locked, detached);
- renew, expire into grace, expire past grace;
- set primary; subname create and transfer.

**Actors** (who the action touches), each as EOA and as smart account:
- the actor before and after (sender);
- the recipient;
- a residual role holder (roles granted to a third party survive a transfer);
- the ETH-record holder;
- a resolver-role holder;
- a stranger.

**Views:**
- manager — My Names presence and tag; profile Edit availability; profile
  records; primary-name candidates; the upgrade list;
- explorer — ownership tab; roles; records; transfer availability.

**Oracle per cell**, derived — not invented:
- registry roles after the action from contracts-v2 (`_transferRoles` etc.);
- write rights from the resolver actually in place (PermissionedResolver
  roles vs PublicResolverV2 owner);
- primary-name validity from the UniversalResolver rule (`addr(60)` match);
- ens-app-v3 parity where the semantics did not change; where v2 deliberately
  differs (editing by resolver role), the cell is marked **needs product
  ruling** and is not silently decided by the test.

Each cell becomes a scenario id with tier, oracle and source, reconciled by
`coverage/reconcile.ts` like every other row.

## 4. Oracle sources to mine (exact files)

| Source | Files | Gives |
|---|---|---|
| contracts-v2 | `contracts/test/unit/registry/PermissionedRegistry.t.sol:693-890` (+ `test_transferAbortsAfterRevoke` `:1576`, `test_transferWithMaxAssignees` `:1608`, `test_transferWhileExpired` `:1626`) | roles after transfer |
| contracts-v2 | `contracts/test/unit/resolver/PermissionedResolver.t.sol:294-716` | who may write which record part |
| contracts-v2 | `test/unit/access-control/EnhancedAccessControl.t.sol`, `test/unit/reverse-registrar/{L2ReverseRegistrar,DefaultReverseRegistrarAdapter}.t.sol`, `test/unit/migration/MigrationOwnershipTransfer.t.sol` | role plumbing, primary names, migration ownership |
| ens-app-v3 | `src/hooks/ownership/useRoles/utils/getRoles.test.ts`, `src/hooks/abilities/utils/get*Abilities.test.ts`, `src/utils/checkAvailablePrimaryName.test.ts` | per-role abilities, primary eligibility |
| ens-app-v3 | `e2e/specs/stateless/{ownership,ownership.2LD,setPrimary,profileEditor,myNames,permissions}.spec.ts` | user-visible parity cases |
| ensjs | `packages/ensjs/src/actions/subgraph/getNamesForAddress.ts:48-53,162-216,330-341`; `actions/public/v2/*` | list relations; v2 role reads for test oracles |

## 5. Rules going forward

1. **Observe from every side.** A test that changes state ends by observing
   from each affected actor, in every app that shows that state (needs the
   cross-app fixture, HW7).
2. **No mock-only derived views.** A view computed from indexer data (lists,
   tags, eligibility) needs a real-mode test; the mock tests stay for paging
   and rendering.
3. **Unit rules cite their source.** A unit test that pins a role, edit or
   eligibility rule names the contract or ens-app-v3 rule it implements, or
   says it is a deliberate departure.
4. **Run the invariants.** INV3/INV4/INV5 sweeps run on the manager dashboard
   and profile pages after every state-changing scenario.
5. **PASS means seen green.** Fix the local results-file gap so the ledger
   reads run results, not tag presence.

## 6. Backlog, in order (not started)

1. **Reproduce** Bugs 1 and 3 as failing real-mode tests with defect rows;
   settle Bug 1's stale relation via bigname. Reproduce Bug 2 on the seeded
   grid; file it or close it as a false positive.
2. **Cross-app fixture (HW7)**, then X4, R8, X14, X5, X8.
3. **Observer-matrix generator** and its first slice: transfer × all actors ×
   manager views.
4. **INV5 sweep:** for each action the manager offers on a name, simulate it
   for the connected wallet; an offered action that reverts is a defect.
5. **Real-mode twins** of the dashboard mock tests (H2, H4).
6. **Review the unit tests** that encode Bugs 1 and 3 with the manager team.
