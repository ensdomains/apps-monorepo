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
| E2E-001 | F1 | portal | S1 | Migrated locked V1 name offered a `detach-registry` step its owner cannot execute — `detach-resolver` had already run irreversibly | Owner lacks `ROLE_SET_SUBREGISTRY` on the locked name's `WrapperRegistry`, so `buildTransferPlan` must not offer the step. Measured in [`transfer-web446-test-plan.md`](./transfer-web446-test-plan.md) §2 finding F1 | `pnpm e2e:portal --grep "without offering the registry detach it cannot perform"` | _pending_ | fixed |

Status legend for the row above: **fixed** = the code fix landed
(`f524d71b3`, `dab56ec16` — role validation in `useTransferDetachTargets`) and
the regression test is committed (`ff2d85b30`), but this register will not say
`verified` until that test is observed green in a run recorded by
`pnpm e2e:coverage --results`.
