# GOAL — Implement the apps-monorepo E2E suite, run it, and register every defect it finds

Plan of record: [`e2e-master-test-plan.md`](./e2e-master-test-plan.md)
Defect register: [`e2e-defects.md`](./e2e-defects.md)

---

## Objective

Take the ~210 scenarios in the master plan from paper to **passing or filed**.
A scenario is finished when one of two things is true:

1. A committed Playwright test asserts it against the real stack and passes, or
2. A committed Playwright test asserts it, **fails**, and the failure is
   registered as a defect with an on-chain/console oracle proving the app —
   not the test — is wrong.

"Skipped", "flaky", and "couldn't get it working" are not terminal states.
Every scenario ID from the plan ends in exactly one of: **PASS**, **DEFECT**,
or **EXEMPT** (written, reviewed reason).

---

## How progress is measured

Progress is a measurement, not a claim. The ledger lives in `e2e/coverage/`:

| File | Role |
|---|---|
| `coverage/scenarios.ts` | The scenario registry — every ID in §5/§6 of the plan, plus the §2 harness items as `HW1`–`HW10` |
| `coverage/reconcile.ts` | The reconciler — `pnpm e2e:coverage` |
| `coverage/baseline.json` | The ratchet — terminal counts per phase, may only increase |
| `docs/e2e-coverage.md` | Generated report. Never hand-edit; CI fails if it is stale. |

**Tagging convention.** A test claims a scenario with a Playwright tag:

```ts
test('grants ROLE_SET_RESOLVER to a second wallet', { tag: ['@scenario:C2'] }, async ({ … }) => {
```

Tag a test with `@scenario:<ID>` **only when its assertions cover that
scenario's oracle**. A partial assertion left untagged is honest; a tag on a
test that asserts less than the oracle is the one thing this ledger cannot
detect, and it is how a coverage number becomes a lie.

**What the reconciler derives, and from what evidence:**

| State | Evidence required | Terminal |
|---|---|---|
| PASS | a committed, non-skipped, non-quarantined tagged test that a project config actually runs — and, with `--results <playwright.json>`, that actually passed | yes |
| DEFECT | a row in `e2e-defects.md` naming the scenario **and** a committed test proving it | yes |
| EXEMPT | a written `exempt` block in `scenarios.ts` (reason, approver, date) | yes |
| quarantined / skipped / excluded / not-started | — | **no** |

`excluded` means a tagged test exists but no Playwright config runs it. It is
reported, never counted.

**CI fails** on: a tag not in the registry, a scenario whose every test is
skipped with no EXEMPT, a defect filed without a test, a phase's terminal count
going down, or a stale generated report.

---

## The working loop

Run this loop per batch. A batch is one section of the plan (e.g. §5.C Roles),
sized to 5–12 scenarios — small enough that a failing batch is diagnosable.

```
1. WRITE     harness first (fixtures/helpers), then the specs for the batch
2. RUN       pnpm e2e:<project> --grep "@<tag>"  against the local infra stack
3. TRIAGE    every red test → is it the test or the app?
                test wrong  → fix the test, back to 2
                app wrong   → register a defect, mark the test .fail()/tagged, keep it committed
                infra wrong → fix infra, note it, back to 2
4. VERIFY    re-run the batch twice green in a row (flake gate) + full @smoke
5. LAND      one PR per batch: specs + harness + defect entries + plan status update
```

**Triage rule.** A test is only allowed to be called wrong if you can state the
correct expected behaviour and cite where it comes from — a contracts-v2 test, a
line in `MIGRATION_CASE_STUDY.md`, or an on-chain read. Otherwise it is a defect.

**Defect-not-workaround rule.** Never weaken an assertion to make a test green.
If the app's behaviour disagrees with the oracle, the test keeps the oracle and
the disagreement gets filed.

---

## Defect registration

Every defect gets a row in [`e2e-defects.md`](./e2e-defects.md) **and** a GitHub
issue on `ensdomains/apps-monorepo`. The register is the index; the issue is the
detail.

Required for every defect:

| Field | Rule |
|---|---|
| ID | `E2E-###`, sequential, never reused |
| Scenario | The plan's scenario ID (e.g. `C5`, `G13`) — this is the traceability link |
| App | `manager` / `portal` / `cross-app` / `shared` |
| Severity | **S1** data loss, funds at risk, irreversible wrong on-chain write · **S2** core flow blocked, no workaround · **S3** wrong state shown, workaround exists · **S4** cosmetic/copy |
| Expected | The oracle, cited (contract test name, case-study line, or on-chain read) |
| Actual | What the app did, with the console/transaction evidence |
| Repro | The spec file + test title; anyone can run one command to see it |
| Status | `open` → `triaged` → `fixed` → `verified` (verified = the test is green without modification) |

**S1 defects stop the batch.** File immediately, notify, do not continue writing
new tests in that area until triaged. An irreversible on-chain write executed on
a plan step that later reverts (the known `detach-resolver` → `detach-registry`
shape from the transfer work) is S1 by definition.

---

## Phases and exit criteria

Each phase lands as its own set of PRs and is done when its exit criterion holds.

| Phase | Scope (plan §) | Exit criterion |
|---|---|---|
| **P0 — Harness** | H1–H10 | All ten helpers exist, are used by at least one real spec, and `@smoke` is green on top of them. No new scenarios required. |
| **P1 — Protocol core** | §5.C roles, §5.D registry/subnames, §5.E resolvers | Every role in §3.3 has a positive **and** a negative case; every row of §7's `PermissionedRegistry` / `UserRegistry` / `PermissionedResolver` lines is PASS, DEFECT, or EXEMPT |
| **P2 — Lifecycle** | §5.A gaps, §5.B renew/grace/bulk/auto | All five lifecycle states of §3.1 reachable and asserted; all four time windows of §3.2 exercised at both boundaries (inside/outside) |
| **P3 — Migration matrix** | §5.G a–e | Every row of the token-shape matrix (G1–G9), the full fuse mapping table of §3.4, and every unmigratable reason (G10–G15) has a terminal state |
| **P4 — Cross-app** | §6 | `e2e/projects/cross-app/tests/` is non-empty and X1–X10 are terminal |
| **P5 — Surfaces** | §5.F gaps, §5.H, §5.I, §5.J | Every route in both apps is visited by at least one test; H8's L2/reverse paths covered |
| **P6 — Resilience & quality** | §5.K, §5.L | Zero-console-error budget enforced suite-wide; axe clean or exempted on every top-level route; every locale smoke-tested |

**Overall done:** every row in plan §7 (contracts-v2 traceability) and §8
(ens-app-v3 parity) is terminal, and the defect register has no `open` S1 or S2.

---

## Reporting

After each batch, report — no narration, just the numbers:

```
Batch: §5.C Roles (C1–C14)
  PASS 11 · DEFECT 2 (E2E-014 S2, E2E-015 S3) · EXEMPT 1 (C10 — cap unreachable via UI)
  Runtime 6m12s · Flake 0/2 reruns
```

Keep a running status column in the master plan's scenario tables as batches
land, so the plan doubles as the coverage report.
