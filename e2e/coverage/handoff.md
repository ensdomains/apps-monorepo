# E2E build — iteration handoff

The file `/e2e-goal` reads first. One section per iteration, newest at the top.
`In flight: nothing` is the goal.

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
