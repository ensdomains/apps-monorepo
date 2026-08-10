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
  `E2E-###` row — still awaiting a ruling.

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
