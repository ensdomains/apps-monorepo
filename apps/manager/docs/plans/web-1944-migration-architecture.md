# WEB-1944 migration architecture

The implementation starts from main `3853f5862`. The pasted issue is the
target design; the existing recovery and transaction safety checks remain the
regression baseline. Each step must be independently reviewable.

## First increment: explicit classification clock

`classifyName` and `classifyNames` require a `Clock` containing Unix seconds
as a bigint. The bulk classifier passes the same clock to every name.
Recovery classification also takes its clock explicitly.

Manager's selection and dashboard helpers reuse the time already supplied by
their callers. Other application boundaries capture wall time before invoking
the classifier, preserving their current clock source. This increment does
not switch to chain time: that policy choice also needs to cover live
eligibility, renewal quotes, planning, and recovery together.

The alternatives were an optional clock with an internal wall-time default,
or a required clock. The required input prevents new callers from silently
falling back to a different instant. All Manager and Portal callers migrate
together; existing assertions retain their meaning.

Verification covers registration expiry before and at the boundary, clock
forwarding through bulk classification, existing wrapper/grace cases, and the
affected Manager, Portal, and shared-package tests and typechecks. Dashboard
classification no longer needs a mocked global clock.

Validation of this increment:

- Manager: 423 tests passed across 13 affected files.
- Portal: 12 tests passed across 3 affected files.
- Migration package: 16 domain/adapter tests passed.
- `pnpm typecheck` passed in Manager, Portal, and the migration package.
- Restoring the internal wall-clock read made the two new regression scenarios
  fail; restoring the implementation passed the classification/dashboard checks.
- No existing test assertions were changed or removed.
- Browser/wallet E2E has not run. The local Manager and Anvil services were
  not running, no baked Anvil state was available, and Docker (used by the
  documented local E2E stack) was unavailable in this environment.

## Remaining increments

1. Normalize expiry states and consolidate grace policy. Resolve chain time
   versus wall time, then use one plan clock across classification, live facts,
   readiness checks, and renewal projections.
2. Introduce normalized snapshots and a total namehash-keyed classifier, then
   migrate the separate eligibility and copy-route decisions.
3. Derive deterministic plan/operation IDs, preview descriptors, and prompt
   budgets from immutable operations.
4. Add the append-only log and pure fold, with legacy-journal migration and
   crash-injection coverage. Switch progress/recovery to the fold before
   removing the current journal, tracker, and retry filtering.
5. Introduce the run engine with typed outcomes, whole-run scope locking, and
   a lifetime above the upgrade route. Share the lock/log primitive with the
   transaction manager where both flows need it.
6. Change the temporary-grant retry/revoke policy after its security decision.

## Recovery invariants

- Record intent before prompting, hash after submission, and verified progress
  before dropping receipt evidence.
- Never resubmit a successful receipt that fails verification.
- Never credit exact V2 state without recorded attempt evidence.
- Retain final evidence through cleanup.
- Keep pre-prompt subregistry/copy-target rechecks and receipt-block verification.

## Design notes

The classifier previously read the global clock once per name. Selection and
dashboard helpers separately received a timestamp, so one decision could use
two clocks. The first increment makes this dependency explicit without
restructuring the run or changing its recovery ordering.
