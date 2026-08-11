# E2E build — iteration handoff

The file `/e2e-goal` reads first. One section per iteration, newest at the top.
`In flight: nothing` is the goal.

---

## Iteration 4 — 2026-08-12

**Batch:** BOOTSTRAP · extend the harness gate to the manager project —
`specs/harness-manager.spec.ts`.

**Result:** PASS 0 · DEFECT 0 · EXEMPT 0 · PRODUCT-GAP 0 (no scenarios worked)

- Terminal: **39 → 39**. Ratchet unchanged. Invariant sites 0/32.
- 5 tests: **4 passed, 1 skipped**, two consecutive runs. Wired as a blocking
  dependency of `manager-e2e`.
- Portal harness re-verified green (7 passed). Address gate green.

**In flight:** nothing.

### FINDING — the `makeV1Name` blocker is now proven, precisely and citably

The rule-6 test fails exactly as predicted, and the diagnosis is no longer
inference:

- `makeV1Name` registers into `V1_BASE_REGISTRAR` = `0x64096092…`
  (`fixtures/makeV1Name.ts:61`).
- The migration code resolves `ensBaseRegistrarImplementation` through ensjs =
  `0x57f1887a…`, at **`apps/manager/src/features/migration/contracts/addresses.ts:14`**
  and **`packages/migration/src/service/preflightChecks.ts:13`**. Same story for
  `ensNameWrapper` at lines 18 and 17 of those files.
- Both registrars are deployed and live on the fork (asserted, so the diagnosis
  cannot silently rot).
- So registration succeeds and **the app cannot see any name this fixture
  makes**. Existing migration specs paper over it with a V1-subgraph route mock,
  which answers for a name the chain-reading half cannot find — that is why the
  suite above it stayed green for weeks.

Encoded as **`test.fail()`**, not skipped, so it *executes* every run:
- while the fixture is broken → the assertion fails → `test.fail()` passes;
- the moment someone rewires it → the assertion passes → Playwright reports
  "expected to fail but passed" → **red**, which is precisely when a human
  should look, because that is when the 61 `G*` rows unblock and the annotation
  must come off.

`makeV1Name`'s **rule 5 passes** — it genuinely registers into the registrar it
targets. The fault is only ever "wrong registrar", not "does nothing". Worth
knowing before anyone starts rewiring.

### BLOCKER — the whole `manager-e2e` project cannot run

`connectWithHeadlessWallet` (`helpers/manager-auth.ts:92`) waits 15s for a
Connect button the manager does not render under `VITE_FF_USE_EOA=false` in
`apps/manager/.env` — Para-embedded has no wagmi client for the headless
provider to attach to.

**Verified not caused by this batch**: `profile.spec.ts:113 "shows validation
errors for invalid records"` fails at the identical line under `--no-deps`, with
no harness project running. This blocks *every* manager-side rule-6 check and
every manager scenario, not just this file.

Not fixed here on purpose: flipping that flag restarts the owner's dev server
and changes which wallet path the app runs. That is their call, not a test-side
infra fix. Recorded as **blocked-env, owner sugh01, expires 2026-08-19**, and
the one affected test is `test.skip()`'d at its declaration with the reason at
the site.

### Learned — do not re-derive

- **`test.skip(true, …)` inside a test body does not work when the test uses a
  fixture.** Fixtures resolve *before* the body runs, so the in-body skip is
  reached only after the fixture has already thrown — the test fails instead of
  skipping. Use the static form `test.skip('title', fn)`, which takes no
  message, so the reason has to live in a comment.
- **`test.fail()` vs `test.skip()` mean different things and both are legitimate
  here.** `fail` keeps the test executing against a correct assertion whose
  current outcome is failure; `skip` is for blocked-env, and needs an owner and
  a date. Neither weakens an oracle — that distinction is what makes them
  allowed under §16.5.
- **The address gate caught one of my own violations this iteration**: a
  hardcoded zero-address literal in the new spec. Use viem's `zeroAddress`.
  Small, but it is the gate paying for itself two iterations after landing.
- V1 registration is a permanent fork write, so both `makeV1Name` tests are
  snapshot-wrapped — same reasoning as iteration 3's clock leak, since this file
  is also a project dependency.
- `ERC721.ownerOf` **reverts** on an unregistered token rather than returning
  zero. The helper catches it and returns `null`; a revert here is the answer,
  not an error.

### Parked

- `0x640294a2…` identity — owner **sugh01**, expires **2026-08-18** (iteration 2).
- Manager connect flow / `VITE_FF_USE_EOA` — owner **sugh01**, expires
  **2026-08-19** (this iteration).

Both need a human. Neither blocks portal-side work.

### Skipped-blocked

Every manager-side scenario, on the connect blocker above. R0's `F*` (transfer)
and `I*` (fuses) rows are portal-side and unaffected.

### Next

**B0 + B4, portal-side, then the first real batch.**

B2 is complete on both projects. Remaining bootstrap:

1. **B0** — Panoptes manifest vs `ensL1Contracts[sepolia]`. The API is on
   **:5655** (not 42069). This is the "success with zero rows" failure mode, and
   `INV4` has 8 sites waiting on it.
2. **B4** — audit the ~16 inherited specs against §5. Note
   `projects/manager/playwright.config.ts` carries
   `testIgnore: /temporaryPremium|migration|notification/`, which is a live
   instance of trap #6 (config exclusion) and explains the `A11` warning the
   reconciler still prints.

Then R0, portal-side only while the manager is blocked: **F** (transfer, 14
rows) and **I** (fuses, 6) are reachable; **G** (61) is not, on the fixture
above.

Infra: Anvil ✅ :8545, manager ✅ :3000 (serving, but not e2e-connectable),
portal ✅ :3001, panoptes-api ✅ :5655.

---

## Iteration 3 — 2026-08-12

**Batch:** BOOTSTRAP · goal §6 B2, second half — `specs/harness.spec.ts`.
**B2 is now complete.**

**Result:** PASS 0 · DEFECT 0 · EXEMPT 0 · PRODUCT-GAP 0 (no scenarios worked)

- Terminal: **39 → 39**. The suite carries no `@scenario:` tags — its subject is
  the fixtures, not the app. It moves the gate, not the ledger.
- Invariant sites: 0 checked. Ratchet: unchanged.
- **7 tests, two consecutive green runs** (12.0s, 12.0s), wired as a Playwright
  project dependency of `portal-e2e`, so red aborts the run.

**In flight:** nothing.

### What it covers

Each subject gets both halves — rule 5 (read the postcondition back
independently) and, where it applies, rule 6 (through the app's own read path).

| Subject | Rule 5 | Rule 6 |
|---|---|---|
| `makeName` | registered in the `.eth` registry, owned by the requested account, expiry in the future | the portal's `/$name` page renders it |
| `makeName` negative duration | the name really is expired at the current block | — |
| `makeSubname` | every level registered *in its stated parent registry*, owner matches, claimed subregistry actually attached, deepest owner holds a non-empty bitmap | — |
| `wallets` | three distinct, funded participants | the portal's header shows the injected account |
| `chain-snapshot` | `revert` actually undoes a registration | — |
| `time` | `increaseTime` moves `block.timestamp`, page clock follows, clock restored after | — |
| anvil | fork block > 1e6, `.eth` registry has bytecode at the address the apps' config names | — |

### Learned — do not re-derive

- **`ownerOf` needs `labelToCanonicalId(label)`, not `keccak256(label)`.** Note
  the registry ABI: `getStatus(uint256 anyId)` canonicalises internally,
  `ownerOf(uint256 id)` does not. Reading `ownerOf(keccak256(label))` returns
  **the zero address for a perfectly healthy name** — it looks exactly like "the
  fixture registered nothing". Idiom to copy: `transfer.spec.ts:65`.
- **`makeName`'s `owner` takes a portal *User* slot, not a `wallets`
  participant.** `wallets.ROLES` maps owner→user, manager→user2,
  stranger→user3; passing `'owner'` throws `User not found: owner`. Pair
  `makeName({owner:'user'})` with `wallets.account('owner')` — same account.
- **The portal header truncates to `0xf39…266`** — five leading characters, a
  U+2026 ellipsis, three trailing. A four-character prefix match finds nothing.
- **Three of my seven assertions were wrong on the first run**, and all three
  failed in ways that read as fixture or app faults rather than test faults.
  That is the argument for this suite existing, applied to itself: a harness
  gate written and never watched fail is worth nothing.

### The state leak this batch introduced, and closed

The first working version pushed the shared fork clock **+29 days per run**.
Because this project is a *dependency* of the whole portal suite, that is a
30-day jump before every run of everything.

Two separate causes, and the obvious one was not the culprit:

1. `time`'s explicit `increaseTime` — snapshotted and reverted. Suspected first.
2. **`makeName({duration: -1 day})` — the actual source.** The fixture
   implements "expired name" as *register for the 28-day minimum, then advance
   the clock past expiry*, so asking for an expired name costs ~29 days of fork
   clock, permanently. Harmless in a leaf spec; not harmless in a dependency.

Measured before/after each fix: **+29 days → +158 seconds** (block mining
only). Both are now snapshot-wrapped, and the `time` test *asserts* the restore
rather than assuming it.

**Generalisation worth carrying:** anything that runs as a project dependency
must be clock-neutral. The fork is at **2027-06-02** against a wall clock of
2026-08-11 — ~295 days ahead, accumulated by prior runs. Most of that predates
this batch; 90 days of it was mine before the fix.

### Not caused by this batch

`transfer.spec.ts:687 "rejects the zero address as a recipient"` fails —
`getByPlaceholder('ENS name or address')` times out on
`/$name/ownership/transfer`. **Verified pre-existing**: it fails identically
under `--no-deps`, with the harness project not running at all. Not triaged
further; it belongs to whoever takes the F-area batch. It is the only portal
test this iteration executed, so no claim is made about the other 57.

### Parked

`0x640294a2…` identity — owner **sugh01**, expires **2026-08-18**. Unchanged
from iteration 2, and still blocking any trustworthy `GR*` result.

### Skipped-blocked

Nothing.

### Next

Two candidates; take the first.

1. **Extend the harness gate to the manager project.** `makeV1Name` and
   `makeV2Name` have no self-test, and `makeV1Name` is the fixture whose known
   fault (registering into a deployment the migration UI never reads) is the
   documented blocker on all 61 `G*` rows. A self-test there turns an
   undocumented weeks-long silent failure into an immediate red. Expect it to
   fail on the rule-6 half — that is the point, and the failure should be filed,
   not weakened. **Do not wire it as a blocking dependency while it is red**;
   put it in its own non-blocking project first, or the manager suite cannot
   run at all.
2. **B0 / B4** — Panoptes manifest vs `ensL1Contracts[sepolia]` (the API is on
   **:5655**, not 42069), then audit the ~16 inherited specs.

Then R0: **83 rows, 77 not-started**.

Infra this iteration: Anvil ✅ :8545, manager ✅ :3000, portal ✅ :3001,
panoptes-api ✅ :5655, mockestrator :3007, alto :4337.

---

## Iteration 2 — 2026-08-11

**Batch:** BOOTSTRAP · goal §6 B2, first half — the rule-7 address-literal gate.

**Result:** PASS 0 · DEFECT 0 · EXEMPT 0 · PRODUCT-GAP 0 (no scenarios worked)

- Terminal: **39 → 39**. Ledger untouched.
- Invariant sites: 0 checked.
- Ratchet: unchanged.
- New gate: `pnpm e2e:check:addresses`, wired into `.github/workflows/e2e.yml`
  ahead of the reconciler. **Green.**

**In flight:** nothing.

### FINDING — one address, two contradictory identities

`0x640294a2b2d87e7f522db3e3e3e876764bce170d` is declared as
**`V1_PUBLIC_RESOLVER`** in `fixtures/makeV1Name.ts:65` and as
**`DEDICATED_RESOLVER`** — a V2 resolver — in `fixtures/makeName.ts:57`. It
cannot be both.

Measured on the fork at block 11467283, 2026-08-11:

| | address | size | codehash |
|---|---|---|---|
| the disputed address | `0x640294a2…` | 15115 B | `0xd1d78319` |
| ensjs `ensPublicResolver` | `0x5239A812…` | 14001 B | `0x6cce3025` |
| ensjs `ensPermissionedResolverImpl` | `0x9EAe5C27…` | 17597 B | `0x7a5bbb7f` |
| V1 registry's resolver for `eth` | `0x18CB116a…` | 10700 B | `0x090b6561` |

It answers ERC165 / `addr` / multicoin `addr` / `text` / `contenthash` but not
`IExtendedResolver`, and **it does not appear anywhere in
`ensL1Contracts[sepolia]`**. So it is a third contract carrying two names, and
at least one of those names is wrong.

Not filed in `e2e-defects.md`: the reconciler requires a defect row to name a
scenario *and* have a failing test proving it, and this is a harness fault with
neither — filing it would trip the `defect-unproven` CI failure. It lives here,
in a comment at `makeName.ts:57`, and in the gate's allowlist with
`conflictAcceptedUntil: 2026-08-18`, owner **sugh01**. The gate goes red on that
date. Per §10 the ruling defaults to EXEMPT after 5 working days — but note that
an EXEMPT here would mean *accepting an unidentified resolver*, which is not a
real option; someone has to say which name is correct.

**Consequence: no `GR*` record-replay result can be trusted until this is
settled.** GR1/GR3/GR12 all turn on which resolver a V1 name is reported to
have. Do not spend an iteration on the GR batch before resolving it.

### What changed

- **`scripts/check-address-literals.ts`** — new. Two checks:
  1. *unaccounted literal* — a 20-byte hex literal with no allowlist entry;
  2. *conflicting binding* — one address bound to two identifier names, which is
     the drift incident itself. Waivable only with an owner and a date.
- **`helpers/mock-v1-subgraph.ts`** — was re-declaring `V1_PUBLIC_RESOLVER` and
  the NameWrapper address as its own literals. Now imports both from
  `makeV1Name.ts`, which is the single place the V1 deployment is pinned. This
  was the "same registry, three different addresses, three files" pattern in
  progress.
- **`.github/workflows/e2e.yml`** — the gate runs in the `coverage` job, before
  the reconciler.

### Learned — do not re-derive

- **Anchor the regex on both sides: `\b0x[0-9a-fA-F]{40}\b`.** Without the
  trailing `\b` it matches the first 40 characters of every 32-byte Anvil
  private key in the tree. That is the difference between 35 hits and 12, and
  it is why the "35 literals" number in iteration 1's handoff overstated the
  problem — the real count is 14 occurrences of 12 distinct addresses.
- **Detect the binding by looking back two lines, not one.** The formatter wraps
  `export const V1_PUBLIC_RESOLVER =` onto its own line. A line-local match
  found zero bindings in `makeV1Name.ts` and reported the tree clean — it missed
  the one conflict the gate exists to catch. First version of this gate was
  green and useless; a passing gate is worth nothing until you have watched it
  fail.
- **The gate must skip itself.** The allowlist necessarily contains every
  address it governs, so scanning it makes every entry conflict with its own
  subject (7 false conflicts).
- **`pnpm --filter @ens-apps/e2e lint` (`biome check`) already fails** on
  pre-existing issues across ~12 files. The gate is deliberately *not* chained
  behind it with `&&` — it would never run. It is its own script and its own CI
  step.
- **Gate self-test, actually run:** planted an unaccounted literal → exit 1;
  planted a second name for `V1_ENS_REGISTRY` → exit 1 naming both sites; clean
  tree → exit 0. Both violation classes reproduce.
- The 12 accounted-for addresses split into: 2 Anvil dev EOAs, 2 placeholder
  sentinels, 1 canonical cross-chain deployment (Multicall3), 4 pinned-V1-
  deployment contracts, 1 HCA account derived outside the e2e dependency graph,
  1 ENSIP-25 identifier, and the disputed resolver above. 13 occurrences across
  8 files.
- **Known limit of this gate.** It enforces *every literal is accounted for* and
  *no address wears two names*. It does **not** catch a file re-declaring an
  address another file already exports, when both use the same name — that is
  legal under both checks. Biome's unused-import warning is what caught exactly
  that here: the first version of the `mock-v1-subgraph.ts` deduplication
  imported `V1_NAME_WRAPPER` but left the literal in place, so only the resolver
  half landed. If a third check is ever wanted, it is "an allowlisted address
  appears in a file that is not its declaring module".

### Parked

`0x640294a2…` identity — owner **sugh01**, expires **2026-08-18**. See above.

### Skipped-blocked

Nothing.

### Next

**B2, second half — `e2e/specs/harness.spec.ts`.** Not started; nothing is
half-applied. It is the higher-value half (it defends the fixture-invisible-to-
the-app class that cost weeks of confidently wrong results) and it is a batch on
its own because it needs live infra and browsers, where the address gate needed
neither.

Each fixture asserts (a) its own postcondition by read-back and (b) that the app
can see the state through the app's own read path — rules 5 and 6. Subjects, in
dependency order: `makeV2Name`, `makeSubname`, `makeName`, `wallets`,
`chain-snapshot`, `time`, `makeV1Name` (expected red — see its header comment;
it registers into a registrar the migration UI never reads, which is the known
blocker on all 61 `G*` rows). This suite must run first and red must abort the
run.

Infra was up and healthy this iteration: Anvil at block **11467283**, manager
and portal both 200. `pnpm e2e:infra:up` did not need re-running.

After that: B0 (fork block + Panoptes manifest vs `ensL1Contracts[sepolia]`) and
B4 (audit the ~16 inherited specs). Then R0 — **83 rows, 77 not-started**, with
the `G*` matrix at zero and blocked on the V1 fixture, so per §16.3 the unblock
outranks any batch inside the tier.

---

## Iteration 1 — 2026-08-11

**Batch:** BOOTSTRAP · goal §6 B1 + B3 — rebuild the ledger against
`e2e-test-catalogue.md` and stand up Track B.

Not a scenario batch. The bootstrap gate in the skill's Step 1 was open: the
ledger held 179 rows on the superseded P0–P6 phase model, the catalogue defines
~295 on the R0–R4 risk-tier model, and `invariants.ts` did not exist. Per goal
§16.6 this is expected — the terminal count does not move during bootstrap, and
that is not stalling.

**Result:** PASS 0 · DEFECT 0 · EXEMPT 0 · PRODUCT-GAP 0 (no scenarios worked)

- Registry: **179 → 300 rows** (290 scenarios + 10 `HW*` harness).
- Terminal: **39 → 39**. Deliberately unchanged — every re-bucketed row kept
  exactly the evidence it already had. Verify with
  `pnpm e2e:coverage`: `Terminal overall: 39/300`.
- Invariant sites: **0 → 32 registered**, 0 checked.
- Ratchet: rekeyed from phases to tiers, seeded from the observed run
  (`HW 4 · R0 6 · R1 2 · R2 26 · R3 1 · R4 0`). The old P0–P6 numbers are frozen
  in `baseline.json:phasesLegacy` as an audit trail.

**In flight:** nothing.

### What changed

`e2e/coverage/scenarios.ts`
- Added `Tier` (`HW · R0 · R1 · R2 · R3 · R4`) derived from the id prefix via
  `AREA_TIER`, overridable per row. `phase` is retained for traceability to the
  superseded master plan but is **no longer the ratchet key**.
- Rebuilt area **G** from flat `G1–G27`/`GB1–GB8` (35) into the catalogue's
  `GW · GS · GR · GM · GA · GU` (61). The old numbering conflated wrap level with
  fuse burn and had no slot for the record-kind matrix (`GR4–GR7`) where the
  INV2 conservation findings live. Old ids are carried in `planId`.
- Added the catalogue's missing rows: A22–A25, B15–B18, C15–C17, D15–D18,
  E16–E21, F9–F14, I6, J8–J9, K11–K12, L5–L6, X11–X16.
- Added the seven new suites: **N** notifications (12), **Y** payments (7),
  **R** resolution (10), **S** search (7), **T** token (6), **U** shell (9),
  **Z** DNS/TLD (5).

`e2e/coverage/invariants.ts` — new. INV1–INV5 with 32 sites. A site is claimed
by `@inv:INV1-transfer-plan`, and the reconciler derives its status from exactly
the evidence it derives a scenario's PASS from.

`e2e/coverage/reconcile.ts` — rolls up by tier, sweeps invariant sites, ratchets
on both, fails on an unknown `@inv:` tag as it already did on an unknown
`@scenario:` tag.

### Learned — do not re-derive

- **Terminal count is 39 and the arithmetic checks out.** HW 4 + R0 6 + R1 2 +
  R2 26 + R3 1 = 39, matching the pre-rebuild P0 4 + P1 26 + P2 2 + P5 7. If a
  future run reports fewer, something was lost, not re-bucketed.
- **Ids that meant different things in the two documents.** The catalogue won
  every time; the displaced row moved to its new suite. **None of them were
  tagged**, so no coverage moved with them:

  | Superseded plan | Now | Catalogue's meaning for that id |
  |---|---|---|
  | B10 auto-renewal toggles | **Y6** | B10 = bulk renew pricing |
  | B14 four branches *+ syncWrapper* | B14 / **B15** | split; B15 = syncWrapper |
  | B15 continuity bonus | **B16** | B16 = bonus at day 61 and 63 |
  | H4 search | **S1** | H4 = dashboard role-derived columns |
  | H8 primary name | **R1** | H8 = recent-activity feed |
  | H9 fwd/rev mismatch | **R5** | H9 = empty states |
  | H10 token page | **T1** | H10 = expiry rendering per locale |
  | H11 TLD page | **Z1** | H11 = profile owned by a contract/HCA |
  | J7 notifications | **N1–N12** | J7 = HCA deployment on first use |
  | K3–K7 | K4–K8 | K3 is new: indexer up-but-stale, zero rows |
  | K8 back/forward | **U7** | K8 = two tabs, conflicting writes |
  | K9 deep link disconnected | **U6** | K9 = double-click, one transaction |
  | L2 axe *+ keyboard* | L2 / **L3** | split; L3 = keyboard-only |
  | L3 mobile → L4, L4 perf → L5 | | L6 is new: locale number/date formatting |

- **`GA11` and `GA12` are not in the catalogue.** They carry the superseded
  plan's G14 (`NameDataMismatch`) and G15 (`notReserved`) forward, because
  deleting a scenario is a scope change (§12) and neither was ruled on. The
  catalogue's totals table was corrected to 61 for G / 290 overall to match.
- **Two migration tests were untagged, not retagged.** `migration-premium.spec`
  "migrate active name" (was `@scenario:G16`) and `migration.spec` "can edit
  profile after migration" (was `@scenario:G24`). Both were already `excluded`
  — no config runs them — so no terminal state was lost. Neither meets its
  candidate row's oracle: the first asserts only `assertV2Registered` where GW3
  also requires "not unwrapped" + WrapperRegistry-as-subregistry; the second
  asserts a "Profile updated" toast where GU4 requires reading the records back
  off the new resolver. A comment in each names the row and what is missing.
  Tagging either as-is would have been a partial tag (§16.5).
- **B2's backlog is measured: 35 hex address literals across 17 files** under
  `e2e/{fixtures,helpers,projects,specs,scripts}`. That is what the rule-7 grep
  gate has to clear before it can be turned on red.

### Parked

Nothing. No ruling was needed this iteration.

### Skipped-blocked

Nothing. No batch was skipped.

### Next

**Bootstrap B2 — harness integrity gates.** It is the last open bootstrap item
and the skill's Step 1 keeps the gate closed until it lands:

1. `e2e/specs/harness.spec.ts` whose *subject is the fixtures* — each fixture
   asserts its own postcondition by read-back **and** that the app can see the
   state through its own read path (rules 5–6). This suite runs first and red
   aborts the run. It is what makes `HW1`–`HW10` terminal, so it moves the
   ledger as well as the gate.
2. The rule-7 address-literal grep as a CI check, over the 35 literals above.
   Derive from `ensL1Contracts[sepolia]` through one generated file.

Then B0 (prove the environment: fork block, Panoptes manifest vs
`ensL1Contracts[sepolia]`, both apps load) and B4 (audit the ~16 inherited
specs) before any scenario batch. After that, R0 selection is unambiguous:
**83 rows, 77 not-started**, and the migration matrix inside it is at zero and
blocked on the V1 fixture — so per §16.3 the unblock outranks a batch inside the
tier.
