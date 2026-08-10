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

---

## Environment blockers

Not defects — the app behaves as designed — but they stop scenarios reaching a
terminal state, so they are tracked here until fixed.

### Panoptes indexes a stale contract set (blocks C1, C4, C5)

The portal's roles table reads the indexer first
(`features/roles/hooks/useNameRoleAccounts.ts`) and falls back to an on-chain
log scan **only when the GraphQL call errors**. On the local stack the call
succeeds and returns an empty list, so the fallback never fires and the table
renders "No role holders yet" for a name whose holders are plainly on-chain.

Measured 2026-08-10 against the local fork:

- chain head `11455816`; newest indexed `EACRolesChanged` event `11429318`
- those events carry `contractAddress` `0xdedb9291…` / `0xd9da3774…`, while the
  registry `ensL1Contracts` points the apps at is `0xBDC85dD5…`
- filtering the indexer by that registry address returns zero events
- `panoptes-indexer` logs `Fetched N events, processed 0, skipped N (unknown
  contracts)` — it is not configured for the current deployment

Same root-cause family as the superseded-registry address fixed in
`helpers/migration-assertions.ts`: the local stack still carries an older
deployment's addresses. The fix is to regenerate the Panoptes contract manifest
against the deployment `ensL1Contracts` resolves to.

**Worth a defect once someone rules on it.** An indexer that is *reachable but
misconfigured* returns success-with-no-rows, and the UI presents that as
"nobody holds any role" — a confident false negative about permissions, with no
cross-check against chain. Plan K2 only specifies the indexer being *down*. If
the intended behaviour is that the roles table must not claim "no holders"
without on-chain confirmation, this is an S3 and needs an `E2E-###` row.
