# GOAL v2 — proposal, written from what actually happened on this branch

Supersedes [`e2e-goal.md`](./e2e-goal.md) if adopted. Left as a separate file
deliberately: v1 is in active use and its ledger, ratchet and defect register all
carry forward unchanged. What changes is **what we aim at, in what order, and
what counts as a finished scenario.**

---

## 0. Why v2

v1 was written before any of it had been run. Eight weeks of evidence say it was
right about mechanism — the ledger, the ratchet, the triage rule, the
`verified`-needs-an-observed-run discipline all worked — and wrong about three
things that cost real time:

| What v1 assumed | What happened |
|---|---|
| Scenarios derived from contracts-v2 are reachable through the UI | E9, E12, E14, C13, C14, D10–D14 are not. Each cost a session to discover mid-batch, and each is still non-terminal "awaiting a ruling" with no named ruler and no deadline. |
| The harness is a prerequisite you build once | The harness was the largest source of **false results**: Panoptes indexing a superseded registry, `makeV1Name` writing to a V1 deployment the apps never read, `reserveInV2` silently never reserving, `migration-assertions.ts` and `bake-contracts.py` each naming a *different* third address. Three of these looked exactly like app bugs. |
| Value comes from scenario breadth | Both S1s and the release-blocking record-loss finding came from **invariants applied across flows**, not from any single scenario. E2E-001 and E2E-002 are one class reached through two doors. |

And one sequencing error: P1 (roles — recoverable if wrong) is 26/43 while P3
(migration — irreversible, one-shot, happens at launch) is **0/35**, blocked on
harness items P0 never finished. The most expensive thing to get wrong is the
least covered.

---

## 1. North star

Not "179 scenarios pass."

> **No user of these apps loses a name, a record, or money because of a defect
> we could have found — and we can state precisely which risks we have retired
> and which we have not.**

The second clause is doing work. A suite that cannot say what it *hasn't*
checked cannot be trusted at a launch gate.

---

## 2. Two tracks

v1 had one: implement scenarios. v2 has two, and they find different things.

### Track A — Scenarios (breadth, regression)

The existing 179-ID ledger, unchanged. Answers *"does this flow work?"* Its
output is regression protection. Keep the tagging convention, the reconciler,
the ratchet.

### Track B — Invariant sweeps (depth, discovery)

Answers *"where else is this class of bug?"* Each invariant is a property that
must hold at **every** site in the app where it applies. A sweep enumerates the
sites, checks each, and is done when the list is exhausted — so it is finite and
auditable, not open-ended exploration.

Both S1s and the record-loss finding came from here. This track is where
severity lives.

| # | Invariant | Origin on this branch | Sweep = every… |
|---|---|---|---|
| **I1** | No irreversible write is ordered ahead of a step that can fail | E2E-001 (`detach-resolver` → `detach-registry` the owner cannot execute) and E2E-002 (`detach-resolver` → transfer to a non-receiver) — same class, two doors | multi-step transaction plan the UI builds: transfer, migration batch, record save, role grant, registry deploy, renew |
| **I2** | Conservation — nothing the user holds disappears without being carried or explicitly warned about | `contenthash`, ABI, pubkey, `interfaceImplementer` silently destroyed by migration; `verifyAtomicMigrationBatch` post-checks only what the code knows about | flow that moves or rewrites state: migration, transfer, resolver change, registry detach, upgrade |
| **I3** | Totality — every input lands in exactly one **visible** bucket; no silent drops; every declared reason is producible | `classifyName` returns bare `null` on ≥5 paths (name vanishes from both lists); `registry-only`, `frozen-approval`, `already-migrated` are declared but never emitted | classifier and filter: `classifyNames`, dashboard name lists, search results, migration eligibility, transfer detach targets |
| **I4** | No confident negative without an on-chain cross-check | Panoptes returned success-with-zero-rows on a stale contract manifest; the roles table rendered "No role holders yet" for names that plainly had holders | indexer-backed read that renders an empty state: roles, subnames, history, activity, dashboard, registry/resolver detail |
| **I5** | Every affordance the UI offers is executable by the connected wallet, checked before it is offered | E2E-001's fix was exactly this (role validation in `useTransferDetachTargets`); E2E-002 shows the recipient-side half is still missing | button, toggle and plan step gated on a permission, a role, or a counterparty capability |

**Sweep bookkeeping.** Each invariant gets `coverage/invariants.ts`: the site
list, and per site `checked | clean | defect | n/a`. The reconciler reports
sweep completion beside scenario completion. An invariant is never "done" — it
is *swept to the current site list*, and a new multi-step plan added to the app
reopens I1.

---

## 3. Order by cost of being wrong, not by dependency graph

v1's P0→P6 ordered by what unblocks what. That is an engineering convenience and
it put the irreversible, one-shot work last. Replace with risk tiers; harness
work is pulled in *as each tier needs it* rather than front-loaded as a phase.

| Tier | Scope | Why first | Current state |
|---|---|---|---|
| **R0 — Irreversible & one-shot** | V1→V2 migration (§5.G, all of it), transfer (§5.F), resolver detach, fuse burns | Cannot be undone. Migration happens once per name at launch; a bug found after launch is a bug that cannot be fixed for the names already through it. This is also where every severe finding so far lives. | migration **0/35**; transfer 6/8 with 2 open S1s |
| **R1 — Financial** | Registration + renewal pricing, premium decay, payment tokens, bulk renew, auto-renew (§5.A, §5.B) | Users lose money; errors are visible and reputational | 2/36 |
| **R2 — Authorization** | Roles, permissions, registry/resolver role tables (§5.C, §5.D, §5.E) | Wrong answers cause lockout or unauthorised control — but recoverable | 26/43, the best-covered area |
| **R3 — Display correctness** | Profile, dashboard, search, history, expiry/grace rendering (§5.H, §5.I) | Misleads without destroying | 6/31 |
| **R4 — Resilience & quality** | Fault injection, i18n, a11y, perf (§5.K, §5.L) | Real, but bounded | 0/14 |

**Immediate consequence:** the next batch is not "finish P1." It is **unblock
R0** — fix `makeV1Name` to build in the deployment the apps actually read, and
remove `migration` from the manager config's `testIgnore`. Those two together
are why 35 scenarios are at zero, and each would have hidden the other.

---

## 4. Admission gate: probe before you plan

The rule that would have saved the most time. **No scenario enters a batch until
a probe proves it is reachable and its oracle is readable.** A probe is a
15-minute script in the `e2e/scripts/probe-*.ts` pattern the branch already
invented organically — it answers two questions and nothing else:

1. Does the UI expose this affordance at all?
2. Can the oracle be read (on-chain, console, or indexer-with-cross-check)?

Probe outcomes route immediately, and there are only four:

| Outcome | Disposition |
|---|---|
| reachable, oracle readable | admit to the batch |
| affordance absent, and belongs to the contract suite | **EXEMPT** with written reason + approver |
| affordance absent, and users are meant to have it | **file as a product gap** (a defect against the app, not a test debt) |
| oracle unreadable (indexer entity missing, no distinguishing UI state) | **blocked-product**, with owner and exit condition |

**Rulings expire.** Every scenario parked for a ruling gets a named owner and a
date. **Default after 5 working days: EXEMPT, reason recorded.** Nothing sits
non-terminal indefinitely — E9, E12, E14, C13, C14 and D10–D14 have all been
waiting, which is 10+ scenarios of permanently deferred decisions masquerading
as pending work.

---

## 5. Harness integrity is a gate, not hygiene

The harness produced more false results than the app produced bugs. Four rules,
each traceable to a specific incident, each machine-checkable:

| Rule | Incident it prevents |
|---|---|
| **No contract address literal anywhere in `e2e/**`** outside one generated file derived from the same config the apps read (`ensL1Contracts[sepolia]` / ensjs). CI greps for hex literals. | Panoptes' superseded registry, `migration-assertions.ts`, `bake-contracts.py`'s third address, `makeV1Name`'s unread V1 deployment — one rule, four incidents |
| **Every fixture verifies its own postcondition by read-back and throws.** Not "the tx succeeded" — "the state I claimed to create is there." | `reserveInV2` silently never reserving |
| **Plus: the app can see it.** A fixture asserts its state is visible through the same path the app reads, not just present on chain. | `makeV1Name` — names existed, in a registrar the app never queries |
| **No config exclusion without a registry entry.** `testIgnore`/`testMatch` narrowing fails CI unless each excluded scenario is registered with a reason. The reconciler already *reports* `excluded`; make it fail. | `testIgnore: /migration/` silently zeroing 35 scenarios |

Add `harness.spec.ts`: a suite whose subject is the fixtures. It runs first, and
a red harness suite aborts the run rather than producing confident wrong results
downstream — which is precisely what happened for weeks.

---

## 6. Converge the two harnesses

There are two suites, and **the more severe findings came from the untracked
one.** ~25 `qa2-*.mjs` drivers, currently untracked in git, found the
contenthash/ABI/pubkey/interface loss, the silent-`null` drops, and the
dead ineligibility reasons. They carry two oracles the Playwright suite does not
have, and both are strictly better than what it does have:

- **predicted wallet-confirmation count**, computed from chain state read over
  RPC *before* clicking — replaces the tautological "footer count === dialog
  rows", where both render the same array
- **connected EOA nonce delta** across a run — catches writes nobody asked for

Actions: promote both oracles into the Playwright fixtures (they generalise to
every write flow). Then move the drivers into a tracked `e2e/exploratory/` tier
with one rule — **an exploratory finding must be promoted to a tagged spec
within one batch or it does not count.** Best findings living in untracked files
is a durability risk, not a workflow.

---

## 7. A scenario's real state machine

v1 had three terminal states. Reality produced eight, and the ones v1 lacked got
written in prose in the defect register, where nothing counts them.

```
not-started ──probe──▶ admitted ──implement──▶ PASS
                 │                      └────▶ DEFECT   (test + register row + issue)
                 ├──────────────────────────▶ EXEMPT   (reason + approver + date)
                 └──────────────────────────▶ product-gap  (defect against the app)

side states, each requiring an owner and an exit date:
  blocked-env      infra/config wrong        (Panoptes manifest, makeV1Name)
  blocked-product  app/indexer cannot express the oracle  (C13/C14, D10–D14)
  excluded         test exists, no config runs it         (CI failure, not a report line)
  quarantined      flaky                                  (counts as non-terminal)
```

`product-gap` is new and matters: "the UI doesn't let you do this" is sometimes
a **finding**, not test debt. v1 had no way to say that, so E9's alias-mode gap
sat as a test problem for a week.

---

## 8. Defect classes, not defect counts

E2E-001 and E2E-002 are one class. Reporting them as "2 open S1" understates it
— the class is *irreversible-write-before-fallible-step*, and the correct
response is a sweep, which is exactly what I1 is.

So every defect is filed with a **class**, and a new class triggers its
invariant sweep. The register's index gains one column. This is the difference
between fixing two bugs and retiring a category.

---

## 9. Definition of done

v1: every §7/§8 row terminal, no open S1/S2. Necessary, not sufficient — it can
be satisfied while an unswept flow carries an S1 nobody has looked for.

v2 adds:

1. **Every R0 flow** has scenario coverage **and** all five invariants swept to
   the current site list
2. **No open S1 or S2**, and every closed S1 is `verified` against an observed
   green run
3. **Every non-terminal scenario has a named disposition, an owner, and a date** —
   zero scenarios in an unexplained state
4. **Harness integrity gates green**: no address literals, fixture self-tests
   passing, no unregistered exclusions
5. **A written residual-risk statement**: what we did not check, and why it is
   acceptable. Reviewed and signed off, not implied by a coverage percentage.

(5) is the deliverable a launch gate actually needs.

---

## 10. Reporting

Per batch, unchanged in spirit, extended in content:

```
Batch: R0 / §5.G migration W1–W6 (wrap levels)
  PASS 4 · DEFECT 1 (E2E-003 S1, class: conservation) · EXEMPT 1 (W4 desync — no fixture path, ruled 2026-08-14)
  Invariant sweep: I2 conservation — 7/11 sites clean, 1 defect, 3 unchecked
  Ratchet: R0 terminal 6 → 11
  Residual risk added: multi-batch >29 names untestable (panel cookie cap)
```

The residual-risk line is the new one, and it accumulates into the §9(5)
statement rather than being rediscovered at the end.

---

## 11. What carries over unchanged

The ledger (`coverage/scenarios.ts`, 179 IDs), the reconciler, the ratchet, the
`@scenario:` tagging convention, the triage rule, the defect-not-workaround
rule, S1-stops-the-batch, and `verified` requiring an observed run. All of it
worked. v2 changes the aim and the order, not the machinery.
