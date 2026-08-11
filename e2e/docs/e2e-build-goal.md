# GOAL — Build the E2E suite for apps-monorepo

**Audience: an agent starting with no prior context.** This document is the whole
brief. Read it top to bottom before writing a single test. It is written to be
executable by a fresh session, repeatedly, without the previous session present
to explain anything.

Adopt this as *the* goal and archive `e2e-goal.md` and `e2e-goal-v2.md`. Three
goals is zero goals.

---

## 1. Mission

> Build an end-to-end suite that can state, with evidence, which ways these apps
> can lose a user's name, records, or money — and which of those we have retired.

Two halves, both required. A suite that only demonstrates that happy paths work
is a regression net, not a risk instrument. The second half — being able to say
what has *not* been checked — is what makes the first half trustworthy at a
release gate.

**Non-goals.** Do not test the protocol where the protocol already tests itself:
`contracts-v2` has ~600 unit tests and they are better at contract branches than
a browser ever will be. Test only what a **user can reach through the UI**, and
use the contract tests as the checklist of what *should* be reachable.

**Inherit nothing on trust.** There are ~16 spec files already in
`e2e/projects/**`. Some are excellent, some assert on text where chain state was
available, and at least one suite was passing for weeks while the fixture under
it wrote to contracts the app never reads. Existing tests are **unaudited
inheritance** until you have checked each against §5. Do not count them as
coverage before then.

---

## 2. The system under test

| Piece | Where | What it does |
|---|---|---|
| **manager** app | `apps/manager`, port 3000 | End-user app: register, renew, migrate V1→V2, profile/records, dashboard, notifications, payments. React + TanStack Router, feature-sliced under `src/features/*`. |
| **portal** app | `apps/portal`, port 3001 | Power-user/protocol app: roles, registries, subnames, resolvers, transfer, fuses, resolution explorer. Same stack. |
| **transaction-manager** | `packages/transaction-manager` | XState machine driving every write. `TRANSACTION_FLOW.md` is normative. Emits console transaction ids — your best oracle. |
| **smart-account** | `packages/smart-account` | Rhinestone HCA (ERC-4337). `DEBUGGING_INTENTS.md` is normative. Registration and migration can run EOA **or** HCA — different stage spines, same end state. |
| **migration** | `packages/migration` | `classifyNames.ts` maps V1 name states → migratable token types + ineligibility reasons. The migration's brain. |
| **indexer (Panoptes)** | `packages/indexer`, `e2e/infra/panoptes` | GraphQL over chain events. Many UI surfaces read it *first* and fall back to chain only on error. |

**Chain and infra.** `pnpm e2e:infra:up` brings up an Anvil Sepolia fork, an Alto
bundler, a mockestrator (local Rhinestone orchestrator), and Panoptes.
Playwright 1.58. Wallets are injected via `@ensdomains/headless-web3-provider`.

**Protocol constants you will need constantly** (verified — re-verify if the code
moves, do not trust this table blindly):

| Thing | Value | Source |
|---|---|---|
| V2 grace | 28 days | `apps/manager/src/features/grace/utils/gracePeriod.ts` |
| V1 grace | 90 days | legacy BaseRegistrar |
| V1 continuity bonus | 62 days (`90 − 28`) | `ETHRenewerV1.GRACE_PERIOD = bonusPeriod + gracePeriod` |
| Temporary premium | 21 days, exponential halving | `StandardRentPriceOracle` + `LibHalving` |
| Registry states | `available · reserved · registered · expired · unregistered` | `PermissionedRegistry.getState()` |

Roles are a bitmap (`EnhancedAccessControl`): `ROLE_SET_RESOLVER`,
`ROLE_SET_SUBREGISTRY`, `ROLE_RENEW`, `ROLE_CAN_TRANSFER_ADMIN`,
`ROLE_UNREGISTER`, `ROLE_SET_PARENT`, `ROLE_REGISTRAR`,
`ROLE_REGISTER_RESERVED`, the resolver `ROLE_SET_{ADDR,TEXT,DATA,NAME,
CONTENTHASH,PUBKEY,ABI,INTERFACE,ALIAS}`, each with an `_ADMIN` counterpart that
governs granting it.

---

## 3. Sources of truth

Every scenario must trace to one of these. A scenario you cannot trace is a
scenario you invented, and it will be argued about later.

| Source | Answers | Use it for |
|---|---|---|
| `~/ens/contracts-v2/contracts/test/**` | What the V2 protocol actually does | The **completeness checklist**. Extract test function names; every branch a user can reach becomes a scenario. |
| `~/ens/ens-app-v3/e2e/specs/**` (30 specs, ~250 cases) | What users could already do, and which selectors/flakes are already solved | **Parity checklist**. Every legacy capability is ported, adapted, or explicitly dropped — never silently absent. |
| `~/ens/ens-contracts` (NameWrapper, BaseRegistrar) | V1 ground truth: fuses, grace, premium, token shapes | The **input state space** for migration. |
| `~/ens/ens-app-v3/src/hooks/nameType/getNameType.ts` | The canonical enumeration of V1 name states — 13 `.eth` types | The migration matrix's rows. Do not invent your own taxonomy; this one exists. |
| `apps/manager/src/features/migration/MIGRATION_CASE_STUDY.md` | Migration case taxonomy, receiver routing, fuse→role mapping | Normative for all migration work. |
| `packages/migration/src/service/classifyNames.ts` | How the app collapses 13 types → 5 token types + 8 reasons | The app's own model. Where it disagrees with the case study, that gap is a finding. |

---

## 4. The oracle hierarchy

This single rule determines whether the suite is worth anything. Use the highest
available oracle; never a lower one when a higher one exists.

| Rank | Oracle | Notes |
|---|---|---|
| 1 | **On-chain read** via `helpers/anvil-client` | `ownerOf`, `getResolver`, `getSubregistry`, `getExpiry`, `roles`, `text`, `addr`. Ground truth. |
| 2 | **Exact transaction id** from `ConsoleMonitor` | Asserts the *sequence and count* of steps, e.g. `transfer-<name>-detach-resolver` then `-transfer-token`. Catches wrong plans, not just failed ones. |
| 3 | **Predicted-vs-actual confirmation count** | Compute the expected wallet-confirmation count from chain state read over RPC *before* clicking, then compare. |
| 4 | **EOA nonce delta** across the run | Catches writes nobody asked for. |
| 5 | `getByRole` / `getByTestId` | Structure, not prose. |
| 6 | Visible text | Last resort. Legitimate only for copy that *is* the assertion (an error message, a reason string). |

**Two hard rules.**

- **Never assert on text alone for state that is readable on chain.** "The page
  says Owner: 0xabc" is not evidence the token moved.
- **Never assert two renderings of the same value against each other.** A real
  incident here: a check compared a footer step-count against dialog row count
  when both rendered the same array. It could not fail. Every oracle must be
  derivable independently of the code path it is checking.

---

## 5. Ground rules

Non-negotiable. These exist because each was violated and it cost time.

1. **Never weaken an assertion to make a test green.** If the app disagrees with
   the oracle, the test keeps the oracle and the disagreement gets filed.
2. **A test may only be declared wrong if you can cite the correct behaviour** —
   a named contracts-v2 test, a line in the case study, or an on-chain read.
   Otherwise it is a defect. "The test is probably wrong" is not triage.
3. **Never mock the thing under test.** Route-mocking the indexer is fine when
   the indexer is scenery; it is invalid when the scenario's oracle *is* the
   indexer.
4. **A green test that no config runs is not coverage.** Verify your test is
   actually executed. `testIgnore` in a project config silently zeroed 35
   scenarios here for weeks.
5. **A fixture must verify its own postcondition by read-back, and throw.** Not
   "the transaction succeeded" — "the state I claimed to create is present."
6. **And that the app can see it.** Assert fixture state is visible through the
   same path the app reads. A fixture once created V1 names in a live deployment
   the app never queries: registration succeeded, nothing errored, every name was
   invisible to the app under test.
7. **No contract address literals in `e2e/**`.** Derive every address from the
   same config the apps read (`ensL1Contracts[sepolia]` / ensjs) via one
   generated file. Address drift caused four separate false-result incidents,
   including three different addresses for the same registry across three files.
8. **Time is a lockstep.** Anything time-dependent moves the Anvil clock **and**
   `page.clock` together — `e2e/fixtures/time.ts`. A browser clock disagreeing
   with `block.timestamp` produces failures that look like app bugs.
9. **Indexer lag is a precondition, not a retry.** After a write, wait for the
   indexer to have the specific fact you will assert — *every account named*, not
   just the resource. The race fails silently and permanently: the query succeeds
   with zero rows, the app renders its empty state, and react-query caches that
   for the rest of the test.
10. **One batch, one PR.** Specs + harness + defect entries + regenerated
    coverage. Never a half-landed batch.

---

## 6. Bootstrap — do these in order, before any scenario work

**B0. Prove the environment.** Bring up infra. Confirm Anvil is at the expected
fork block, Panoptes is synced *and* its contract manifest matches
`ensL1Contracts[sepolia]`, and both apps load. Write down the block numbers. A
misconfigured-but-running indexer is the single most expensive failure mode
available to you — it returns success with zero rows and the UI presents that as
a confident answer.

**B1. Build the ledger.** Scenarios must be machine-tracked from day one or
progress becomes a claim.

```
e2e/coverage/scenarios.ts    every scenario: id, tier, area, app, title, oracle, source citation
e2e/coverage/invariants.ts   every invariant: id, statement, site list, per-site status
e2e/coverage/reconcile.ts    `pnpm e2e:coverage`
e2e/coverage/baseline.json   the ratchet — terminal counts per tier, may only increase
e2e/docs/e2e-coverage.md     generated. never hand-edited. CI fails if stale.
```

Tests claim a scenario by Playwright tag: `test('…', { tag: ['@scenario:C2'] })`.
Tag **only when the test's assertions cover that scenario's full oracle.** A tag
on a partial test is the one lie this ledger cannot detect, and it is how a
coverage number becomes worthless.

The reconciler derives status from evidence and **fails CI** on: a tag not in the
registry, a scenario whose every test is skipped without an exemption, a defect
filed with no failing test, a tagged test no config runs, a tier's terminal count
decreasing, or a stale generated report.

**B2. Install the harness integrity gates.** Rules 5–7 above, as CI checks: a
grep for hex address literals under `e2e/`, and a `harness.spec.ts` whose subject
is the fixtures — each fixture asserts its own postcondition *and* app
visibility. This suite runs **first**, and red aborts the run. Otherwise you
spend weeks producing confident wrong results downstream.

**B3. Enumerate the scenario space** from §3. Extract contracts-v2 test names,
`getNameType`'s 13 `.eth` types, `classifyNames`' token types and reasons, and
ens-app-v3's spec titles. Register everything with a source citation. Expect
~180 scenarios. Do not start writing tests during this step.

**B4. Audit the inherited specs.** For each existing spec: which scenario does it
cover, does it meet §4, does a config run it, does its fixture satisfy rules 5–6?
Re-tag what survives; rewrite what doesn't. Do not skip this because the tests
are green — green is exactly what the makeV1Name incident looked like.

**B5. Only now, start batching.**

---

## 7. The unit of work

A **batch** is 5–12 scenarios from one area, small enough that a failing batch is
diagnosable.

```
PROBE      → for each scenario, 15 minutes: does the UI expose this affordance,
             and can the oracle be read? Route the answer (see §9) before planning.
WRITE      → harness first, then specs. Highest oracle available.
RUN        → pnpm e2e:infra:up; pnpm e2e:<project> --grep "@scenario:…"
TRIAGE     → every red: test wrong (cite it) → fix · app wrong → file a defect and
             keep the failing test committed · infra wrong → fix, record, rerun
VERIFY     → two consecutive green runs, plus the smoke suite
LAND       → one PR: specs + harness + defect rows + regenerated coverage + ratchet
```

**Probe first is the highest-leverage rule in this document.** Scenarios derived
from contracts are frequently not reachable through the UI — no mode selector, no
upgrade affordance, an atomic call with no partial state to observe, an indexer
entity that is never populated. Discovering that mid-batch costs a session each
time; discovering it in a probe costs fifteen minutes. Roughly 10 scenarios were
lost to this.

---

## 8. Priority — order by cost of being wrong

Not by dependency convenience. Pull harness work in as each tier needs it.

| Tier | Scope | Why here |
|---|---|---|
| **R0 — Irreversible & one-shot** | V1→V2 migration (the full matrix), transfer, resolver/registry detach, fuse burns | Cannot be undone. Migration happens once per name, at launch; a defect found afterwards cannot be fixed for names already through it. Empirically also where every severe finding has come from. |
| **R1 — Financial** | Registration and renewal pricing, premium decay, payment tokens, bulk renew, auto-renew | Users lose money; highly visible |
| **R2 — Authorization** | Roles, registry/resolver permissions, subname creation rights | Wrong answers cause lockout or unauthorised control — but recoverable |
| **R3 — Display correctness** | Profile, dashboard, search, history, expiry/grace rendering | Misleads without destroying |
| **R4 — Resilience & quality** | Fault injection, i18n, a11y, responsive, perf | Real, bounded |

Within R0, migration first, and within migration follow the `getNameType`
taxonomy: wrap levels (unwrapped / wrapped / emancipated / locked, and note that
`wrapETH2LD` always burns `PARENT_CANNOT_CONTROL`, so a wrapped `.eth` 2LD is *at
minimum* emancipated — `eth-wrapped-2ld` is not a real state), then hierarchies
(locked child, detached child, wrapped subname, unwrapped subname, 3 levels deep,
child-without-parent), then records, then managers/roles, then
approvals/batching/expiry.

---

## 9. Two tracks

### Track A — Scenarios

Breadth and regression. The ledger from B1. Answers *"does this flow work?"*

### Track B — Invariant sweeps

Depth and discovery. Answers *"where else is this class of bug?"* Each invariant
is a property that must hold at **every** site where it applies. A sweep
enumerates the sites and checks each — finite and auditable, not open-ended
exploration.

This track is where severity lives. Start it in R0, not after.

| # | Invariant | Sweep every… |
|---|---|---|
| **I1** | No irreversible write is ordered ahead of a step that can fail | multi-step plan the UI builds: transfer, migration batch, record save, role grant, registry deploy, renew |
| **I2** | Conservation — nothing the user holds vanishes without being carried or explicitly warned about. A post-check that verifies only what the code knows about will pass while destroying what it doesn't. | flow that moves or rewrites state: migration, transfer, resolver change, detach, upgrade. Enumerate what existed *before*, independently of the app's model: texts, every coin type, contenthash, ABI, pubkey, interface, roles, expiry, approvals. |
| **I3** | Totality — every input lands in exactly one **visible** bucket. No silent nulls. Every declared reason is producible. | classifier and filter: migration eligibility, dashboard lists, search results, transfer detach targets |
| **I4** | No confident negative without an on-chain cross-check | indexer-backed read that can render an empty state: roles, subnames, history, activity, dashboard, registry/resolver detail |
| **I5** | Every affordance offered is executable by the connected wallet, checked *before* it is offered | button, toggle, and plan step gated on a role, permission, or counterparty capability |

Two worked examples of why this track exists, both real:

- **I1.** Two S1 defects here are the *same class* through different doors — an
  irreversible `detach-resolver` ordered ahead of a step that could not succeed
  (once because the owner lacked a role, once because the recipient could not
  receive an ERC-1155). Fixing the first did not find the second. A sweep would
  have.
- **I2.** Migration carries text records and coin-type addresses. It does not
  carry `contenthash`, ABI, pubkey, or `interfaceImplementer` — and the
  post-migration verification checks only the records the code knows about, so
  the flow **reports success while destroying data**. A name serving an IPFS site
  loses it, silently. No scenario in a flow-shaped plan asks that question.

Record a defect's **class**, not just its severity. A new class opens or reopens
a sweep.

---

## 10. A scenario's lifecycle

```
not-started ──probe──▶ admitted ──implement──▶ PASS      (green, unweakened, actually run)
                 │                        └──▶ DEFECT    (failing test + register row + issue)
                 ├────────────────────────────▶ EXEMPT    (reason + approver + date)
                 └────────────────────────────▶ PRODUCT-GAP (the UI cannot do a thing users
                                                             should be able to do — a finding
                                                             against the app, not test debt)

side states — each REQUIRES a named owner and an exit date:
  blocked-env      infra/config wrong
  blocked-product  the app or indexer cannot express the oracle
  excluded         a test exists but no config runs it → CI failure
  quarantined      flaky → counts as NON-terminal, always
```

**Rulings expire.** Any scenario parked for a human decision gets an owner and a
date, and **defaults to EXEMPT after 5 working days** with the reason recorded.
Ten-plus scenarios sat indefinitely "awaiting a ruling" with no named ruler — a
permanently deferred decision reading as pending work.

`PRODUCT-GAP` matters: "the UI doesn't let you do this" is sometimes the finding.
Without that disposition it gets filed as test debt and forgotten.

---

## 11. Field guide to the traps

Each of these actually happened. Check for them by reflex.

| Trap | How it presents | Defence |
|---|---|---|
| **Address drift** | Tests pass or fail for reasons unrelated to the app; a table renders empty for a name that plainly has data | Rule 7. One generated address source. |
| **Fixture invisible to the app** | Fixture succeeds, no errors, app shows nothing | Rule 6. Assert through the app's own read path. |
| **Fixture silently no-ops** | Downstream tests fail confusingly | Rule 5. Read back and throw. |
| **Indexer success-with-zero-rows** | UI states a confident negative ("No role holders yet") | I4. Cross-check on chain; verify the manifest in B0. |
| **Indexer lag race** | Passes, then fails on the flake-gate re-run | Rule 9. Wait for the specific fact, every account. |
| **Config exclusion** | Coverage number looks fine; whole areas never execute | Rule 4 + reconciler `excluded` → CI failure. |
| **Tautological oracle** | A check that cannot fail | §4: oracles independent of the path under test. |
| **Unreachable scenario** | Days spent hunting a selector that does not exist | Probe first (§7). |
| **Silent null** | A name vanishes from *both* the eligible and ineligible lists | I3. Assert totality, not just the happy bucket. |
| **Dead reason codes** | A declared error the code can never emit; you write a test for a state that cannot occur | Grep for emit sites before scoping. Three of eight migration reasons are unreachable. |
| **Clock desync** | Time-dependent tests fail like app bugs | Rule 8. |
| **Two harnesses diverging** | Your best findings live in untracked ad-hoc scripts | Exploratory work is allowed, in a tracked tier, and must be promoted to a tagged spec within one batch or it does not count. |

---

## 12. Decide alone vs escalate

**Decide alone:** selectors, fixture design, batch composition, oracle choice,
whether a test is wrong (with a citation), test-side infra fixes.

**Escalate — do not guess:**

- Any **S1** (data loss, funds at risk, irreversible wrong write). File
  immediately, stop the batch, notify. Do not keep writing tests in that area.
- **Intent questions.** Is a declared-but-unreachable code path a defect or dead
  code to delete? Is a restored role bitmap of exactly one role intended? Only
  the author knows.
- **Scope changes.** Anything that would remove a scenario, lower a ratchet, or
  redefine an oracle.
- **App changes.** You are building tests. Fixing the app is a separate,
  explicitly-authorised piece of work.

Everything that does not depend on the answer keeps moving while you wait.

---

## 13. Durability — write for the next session

Assume you will be replaced mid-batch by a session with none of your context.

- **Everything learned goes in a file, not a message.** Blockers, measured
  values, revert reasons, addresses, why a scenario is parked.
- **Record negative results.** "E12 is unreachable because record saves go
  through an atomic multicall" saves the next session a day. Undocumented
  negative findings get re-derived, repeatedly.
- **Never leave a half-applied fix.** A fixture pointing consistently at the
  wrong thing is easier to reason about than one split across two. Revert or
  finish.
- **The generated coverage report is the status.** Do not describe progress in
  prose anywhere else.

---

## 14. Reporting

Per batch, numbers only:

```
Batch: R0 / migration wrap levels (W1–W6)
  PASS 4 · DEFECT 1 (E2E-003 S1, class: conservation) · EXEMPT 1 (W4 — no fixture path, ruled 2026-08-14)
  Invariants: I2 — 7/11 sites clean, 1 defect, 3 unchecked
  Ratchet: R0 terminal 6 → 11
  Residual risk: multi-batch >29 names untestable (dev-panel cookie cap)
```

The residual-risk line accumulates into §15(5) rather than being rediscovered at
the end.

---

## 15. Definition of done

1. Every scenario in the ledger is **terminal** — PASS, DEFECT, EXEMPT, or
   PRODUCT-GAP. Zero scenarios in an unexplained state; every side state has an
   owner and a date.
2. Every **R0** flow has scenario coverage **and** all five invariants swept to
   the current site list.
3. **No open S1 or S2.** Every closed S1 is `verified` — green against an
   observed run recorded by the reconciler, with its original assertion
   unweakened.
4. **Harness integrity gates green**: no address literals, fixture self-tests
   passing, no unregistered exclusions, generated report not stale.
5. A written **residual-risk statement**: what was not checked, and why that is
   acceptable. Reviewed and signed off — not implied by a coverage percentage.

(5) is the actual deliverable of a release gate. A number without it is a number.

---

## 16. Drive to completion — the loop

The suite is ~295 scenarios ([`e2e-test-catalogue.md`](./e2e-test-catalogue.md)).
No single session finishes that. The work is structured so a **loop of
fresh-context iterations** can, without a human in the middle of each one.

### 16.1 Run it

```
/loop /e2e-goal
```

Self-paced: each iteration advances exactly one batch, lands a PR, writes
`e2e/coverage/handoff.md`, and the next iteration resumes from that file. The
`/e2e-goal` skill is the iteration driver; this document is what it reads.

For a supervised pass instead, invoke `/e2e-goal` manually per batch. Same
protocol, you review each PR. `/e2e-goal status` reports without changing
anything.

### 16.2 One batch per iteration, and why

Context exhaustion mid-batch produces half-landed work, which is worse than no
work — a fixture split across two deployments is harder to reason about than one
consistently pointing at the wrong place. So each iteration:

1. checks termination first
2. selects **one** batch of 5–12 scenarios
3. probes, implements, runs, triages, verifies, lands
4. writes the handoff
5. stops

Every iteration must leave the repo resumable by a session with none of its
context. That is what `handoff.md` is for, and it is not optional.

### 16.3 Selection, and never stalling

Order: **R0 → R1 → R2 → R3 → R4**, most non-terminal IDs first within a tier.

Two rules that matter more than the order:

- **An unblock that releases a tier beats a batch inside it.** A broken V1
  fixture blocking 59 migration scenarios outranks six passing role tests.
- **Blocked work is skipped, not waited on.** If the next batch is
  `blocked-env` or `blocked-product` and this iteration cannot unblock it, take
  the next unblocked batch and record the skip. Nothing halts the loop except
  the stop conditions below.

### 16.4 Stop conditions

The loop ends — genuinely, `ScheduleWakeup(stop: true)` — on exactly one of:

| Condition | Meaning |
|---|---|
| **DONE** | All five §15 conditions hold. Report the final numbers and stop. |
| **No progress** | Two consecutive iterations with no increase in terminal count. Stop, report why, escalate. |
| **Fully blocked** | Every remaining scenario is blocked. Stop with the blocker list and what each needs. |

An **S1** stops the *batch* and notifies, but not the loop — the next iteration
continues in a different area.

Nothing else stops it. In particular, a parked ruling does not: it gets an owner
and a date, defaults to EXEMPT after 5 working days, and everything not depending
on the answer keeps moving.

### 16.5 What the loop must not do to make progress

A drive-to-completion loop is under constant pressure to make the number go up.
These are the ways it can cheat, all of which produce a suite worth less than
nothing because it now carries false assurance:

- weakening an assertion so a test goes green
- tagging a partial test with a scenario id
- skipping without a written exemption
- marking terminal on evidence the reconciler cannot verify
- claiming a green run it did not observe
- fixing the app instead of filing the defect
- inventing reachable-looking work when everything real is blocked

The ratchet, the reconciler's CI failures, and `verified`-requires-an-observed-run
exist to make each of these detectable. Iteration N+1 should be able to audit
iteration N from the repo alone.

### 16.6 Expected shape

R0 is 79 scenarios and the migration matrix inside it is at zero, blocked on the
V1 fixture. So the first few iterations are unblocking and bootstrap, not
scenarios — and the terminal count will barely move while they happen. That is
correct, not stalling: the no-progress stop condition counts *terminal scenarios*,
so record bootstrap and unblock work in the handoff explicitly, and the ledger's
harness entries (`HW*`) are what should move during those iterations.
