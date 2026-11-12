---
name: verify-manager-migration
description: "Verify the ENS manager v1 to v2 migration safety, recovery, retry, concurrency, classification, completion, and progress promises. Use when changing migration UI state, orchestration, journals, recovery, classification, subname handling, approvals, verification, grace renewal, or completion."
compatibility: "Requires mise, pnpm, Java 25, and tla2tools 1.7.4."
---

# Verify manager migration

## Property and harm

The migration must never duplicate a wallet submission, lose recoverable work,
claim unverified completion, restore stale authority, silently drop selected
work, or leave temporary authority active after rejection or completion.

A failure can transfer the wrong v1 token state, leave a name without the
expected v2 control, make recovery impossible, or ask the wallet to submit work
that may already be pending.

## Coverage record

Last synchronized production commit:
`6977db2d7d14a8d6c48436d97d4fee6ed703285b`.

The model covers the 37 promises A1 through G5 recorded in
`formal/migration-context/behaviors-draft.md`. The seven user-selected defaults
are recorded in `formal/migration-context/RESULTS.md`.

Covered production paths are enumerated and enforced by
`apps/manager/verification/migration/verify-source-map.mjs`. They include:

- the migration UI machine and page completion effects;
- migration orchestration, planning, journal, recovery, reconciliation,
  verification, copy readiness, subname recreation, and progress;
- grace-renewal orchestration and its cross-tab lock;
- commemorative NFT completion;
- shared migration classification and subname-impact policy.

Executable witnesses outside the synchronized production baseline are:

- `apps/manager/verification/migration/real-code-matrix.test.ts`;
- four intentionally failing regressions in
  `migrationService.test.ts` and `useMigrationRecoverySnapshot.test.ts`.

Verification artifacts are under
`apps/manager/verification/migration/`. The full entry point is
`formal/verify-migration.sh`.

Do not move the sync commit forward merely because TLC ran. Move it only after
reviewing every covered production diff and updating the abstraction where
needed.

## Model-to-code boundaries

Treat these as separate atomic boundaries unless production code combines them:

- each browser tab starting a run;
- each localStorage read and write;
- intent persistence, wallet prompting, hash persistence, and intent deletion;
- receipt lookup, transaction lookup, post-state verification, checkpointing,
  and evidence deletion;
- each retry-plan reconstruction;
- each XState event and cancellation signal;
- each RPC read used for source freshness, authority, classification, or expiry;
- each wallet prompt for approvals, renewal, record replay, migration, or
  cleanup.

The model assumes localStorage, RPC, chain, and wallet responses are honest but
may race or be temporarily unavailable. It does not assume browser operations
are transactionally serialized unless a production lock or compare-and-swap
provides that guarantee.

## Run

From the repository root:

```sh
formal/verify-migration.sh
```

A successful verifier run means:

- source provenance matches the reviewed commit;
- each current invariant has the recorded hold or violation result;
- the hardened finite model passes;
- the integrated model refines `MigrationContract.tla`;
- every `No<Guard>.cfg` fails its named invariant with TLC exit code 12;
- real-code classification and reconciliation matrices pass;
- each retained current-code regression still fails for its named behavior.

Use pstack `/skill:statechart` on `Model.tla` with `Current.cfg` and
`Model.view.mjs` in a scratch directory for shortest product-language traces.
Do not infer the complete set of findings from one raw `Current.cfg` TLC run,
because TLC stops at its first invariant violation.

## Current expected findings

At the synchronized commit, the current model reports violations for A1, A5,
A8, B5, B6, C4, C5, D1, D2, D3, E3, E6, and G5. The other 24 promises hold in
the abstraction. See `formal/migration-context/RESULTS.md` for traces, source
locations, and judgments.

Keep these as findings. Do not weaken a user promise or change a current-model
constant only to make TLC pass.

## Update after code changes

1. Read the changed production paths and their tests.
2. Compare them with the sync commit in `verify-source-map.mjs`.
3. Decide whether each changed atomic boundary alters a model action, guard,
   assumption, invariant, or only the source map.
4. Update the real-code matrix or regression witness when a feasible executable
   check exists.
5. Run `formal/verify-migration.sh`.
6. Run pstack `/skill:statechart` and replay every changed counterexample
   against real code.
7. In a scratch copy, disable each changed protection and prove its sensitivity
   config still fails for the intended invariant.
8. Update this coverage record, `RESULTS.md`, and the source sync commit only
   after all checks agree.

Use `/skill:maintain-formal-verification-skill` when covered production code
changed without this process.

## Scope limits

The finite model checks abstract orchestration and state, not Solidity internals,
gas estimation, indexer correctness, Safe settlement, NFT rendering,
accessibility, layout, or end-to-end browser behavior. Its 37 selected scenarios
are attributable and exhaustive within each abstraction, but they are not the
full cross-product of all names, tabs, crashes, and chain states.
