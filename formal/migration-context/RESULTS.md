# ENS manager migration formal-verification results

## Verdict

At production commit `6977db2d7d14a8d6c48436d97d4fee6ed703285b`, the
revised finite current-code model violates 11 of the 37 required frontend
migration promises. The other 26 hold in the modeled scenarios.

The hardened model passes. All 37 single-guard mutation configurations fail the
intended invariant with TLC exit code 12. The integrated migration behavior also
refines and satisfies `MigrationContract.tla`.

No production code or existing test assertion changed. Seven additive real-code
regressions remain intentionally red and are treated as expected findings by
`formal/verify-migration.sh`.

## Before and after

| Measure | Trial commit `edf46ff4f` | Revised model |
| --- | ---: | ---: |
| Frontend invariants | 37 | 37 |
| Current-code violations | 13 | 11 |
| Current-code holds | 24 | 26 |
| Hardened generated states | 113 | 124 |
| Hardened distinct states | 76 | 81 |
| Mutation configurations | 37 | 37 |
| Green real-code matrix cases | 14 | 23 |
| Expected-red real-code witnesses | 4 | 7 |

The invariant count stays at 37. B6 left the frontend invariant set, while E7
joined it. B5 remains only as the frontend dependency that later work has the
roles it needs.

| Decision | Before | After |
| --- | --- | --- |
| B5 | Exact role equality was a frontend invariant and violated on main. | Exact fuse-derived roles are a contract assumption. Frontend B5 checks only required-role dependencies and holds on main. |
| B6 | Certified traversal was a frontend invariant and violated on main. | Certified traversal is a contract assumption marked as requiring contracts-level formal proof. |
| C5 | Partial completion shared success or failure states. | The model distinguishes success, partial-success, failed-nothing-landed, and cancelled. Main violates the distinction and partial refresh rules. |
| E3 | Every input had to enter a bucket, including null classifications. | Null classifications are intentionally excluded. Every non-null result must enter exactly one classified or ineligible bucket. Main holds. |
| E7 | No full-plan simulation promise existed. | Setup and every batch must pass one ordered chained simulation before the first wallet prompt. Main violates it. |

## Inputs and assumptions

The model retains these product decisions:

1. Model `origin/main` as-is, not the unmerged `mm` branches.
2. The localStorage journal and RPC are honest but racy, not adversarial.
3. One run per scope `(chain, owner, HCA)` across tabs is required.
4. A missing receipt keeps names locked until the chain answers. There is no
   lock timeout or manual release.
5. A temporary HCA grant may not stay live after a user rejection.
6. Complete includes grace renewal, wrapper sync, and cleanup.
7. Dropping at most five unknown-label subnames is allowed only with explicit
   consent.
8. Names whose classifier returns `null` are intentionally outside the preview.
9. Setup and every batch must pass one chained live-state simulation before the
   first wallet prompt. Each batch still receives its live `estimateGas`
   re-check before submission.

Additional modeling assumptions:

- wallet and chain responses are honest;
- under liveness checks, enabled wallet, RPC, and chain responses are fair;
- a permanently unavailable receipt can leave names blocked;
- the model does not describe `waitForTransactionReceipt` internals;
- contract execution inside one submitted outer call is atomic;
- exact fuse-derived roles are supplied by the contracts;
- every registry traversal follows the certified contract path;
- certified registry traversal requires contracts-level formal proof;
- a simulated batch can later fail only through user rejection, a state race, or
  a dropped transaction;
- each such failure retains recovery evidence and reports the state truthfully;
- Solidity internals, gas-estimator internals, Safe settlement, and indexer
  correctness are outside this model;
- each scenario is exhaustive within its finite abstraction, but the model does
  not take the full cross-product of all 37 scenarios.

## Violated invariants

### A1 `A1_OneExecutionPerScope`

**Shortest trace.** One tab reaches the wallet prompt. A second tab starts the
same `(chain, owner, HCA)` scope and also reaches a prompt.

**Source.** `migrationService.ts:2590` starts `executeMigration` without a
per-scope wrapper. The repository has cross-tab locks for grace renewal and NFT
claims, but not for the main migration execution.

**Judgment.** This is a real duplicate-submission risk under the selected
concurrency requirement.

### A5 `A5_PendingAttemptNeverReprompts`

**Shortest trace.** A previous hash is journaled. Its receipt read is
unavailable. Post-state reconciliation clears the uncertainty and permits a new
wallet prompt while the old transaction may still land.

**Source.** Receipt errors become indeterminate in `migrationService.ts:1513`.
The retry fallback converts that error to unresolved near line 1679.

**Judgment.** The no-timeout decision keeps the name locked until the chain gives
a definitive answer.

### A8 `A8_ApprovalsMatchPreviewAndAreCleaned`

**Shortest trace.** Setup grants temporary registration authority. The later
migration prompt is rejected. Rejection cleanup drops only the pending batch
intent and leaves the temporary grant live.

**Source.** Temporary approval state is persisted near
`migrationService.ts:1038`. The batch rejection path near line 2554 removes only
the unsent intent.

**Judgment.** Current behavior conflicts with the decision that temporary HCA
authority may not survive rejection.

### C4 `C4_CompleteMeansAllRequiredWorkDone`

**Shortest trace.** Token migration is verified while grace renewal, wrapper
sync, or temporary-authority cleanup remains. Completion evidence still claims
that all required work is done.

**Source.** `commemorative-nft/migrationCompletion.ts:189` uses remaining
migratable names and migrated-name evidence, but does not account for every
required grace, wrapper-sync, and cleanup operation.

**Judgment.** This is a product-definition gap under the selected completion
definition.

### C5 `C5_OutcomeAndViewsAreTruthful`

**Shortest traces.** Two current paths violate the revised terminal model:

1. A `migration.complete` result contains completed names while selected names
   remain. The UI enters landing and reuniting, then plays the success state.
2. A batch reports completed operations and a later operation throws. The UI
   enters failure. It does not invalidate migration queries, record recently
   migrated names, or record NFT evidence for the completed operations.

**Source.** `migrationUi.machine.ts:341` distinguishes only no-work failure from
all other completion results. `MigrationPage.tsx:441` runs the three refresh
side effects only when `step === 'success'`.

**Judgment.** Partial-success needs its own terminal state. It must list
completed and remaining names, skip the all-done success animation, and run the
same refresh side effects as success using only completed operations.

### D1 `D1_RetryKeepsExactlyRemainingWork`

**Shortest trace.** A failed plan is rehydrated into equivalent classified-name
objects. Retry removes the completed name by semantic identity but filters batch
executions by object identity. The remaining name disappears from the batch.

**Source.** `buildMigrationPlan.ts:1268` uses
`remainingClassified.includes(execution.classified)`.

**Judgment.** This is a latent retry defect. The additive witness leaves
`bob.eth` in `classified` but removes it from the atomic batch.

### D2 `D2_AttemptNeverLosesRecovery`

**Shortest trace.** An effect reads an unused recovery snapshot. Another
execution writes a newer useful snapshot for the same scope before cleanup runs.
The stale effect deletes the newer snapshot by scope.

**Source.** `useMigrationRecoverySnapshot.ts:85` removes by discarded scope.
The journal removal operation near `migrationBatchJournal.ts:970` does not
compare the expected snapshot.

**Judgment.** This is a real stale-cleanup race.

### D3 `D3_ConcurrentJournalWritesDoNotLoseUpdates`

**Shortest trace.** Two tabs read the same journal. Each adds its own intent and
writes the whole journal. The second write overwrites the first.

**Source.** Journal mutation is read-modify-write around
`migrationBatchJournal.ts:832`, with no compare-and-swap or per-scope write lock.

**Judgment.** This is a real cross-tab lost-update defect under the one-run-per-
scope decision.

### E6 `E6_ExpiryUsesChainTimeOrFailsClosed`

**Shortest trace.** The browser clock says a registration or wrapper has not
expired while chain time says it has. Classification proceeds from browser
time.

**Source.** Classification defaults to `Date.now()` in
`packages/migration/src/service/classifyNames.ts:524` and line 574. Related
submit-time checks also use browser time.

**Judgment.** Later checks reduce the impact, but the decision still does not use
chain time or fail closed.

### E7 `E7_AllCallsSimulateBeforeFirstPrompt`

**Shortest trace.** Preview partitions batches with offline gas constants.
Execution rebuilds and live-estimates only the next batch. The first wallet
prompt opens before setup and every planned batch have passed one state-chained
simulation.

**Source.** `buildMigrationPlan.ts:269` defines `previewBatchGas`, used for plan
batches near lines 670 and 1171. `migrationService.ts:2192` sets
`firstBatchOnly: true`. The grace-renewal precedent uses `simulateCalls` in
`estimateGraceRenewalGas.ts:63`.

**Judgment.** This is the new current-code violation. One `eth_simulateV1` or
`simulateCalls` sequence must execute setup and all batches in order against
live state before the first prompt. The per-batch `estimateGas` check remains.

### G5 `G5_RecoveryNeverSilentlyDisappears`

**Shortest trace.** Useful recovery becomes visible, then stale cleanup removes
it without success or an explicit unrecoverable failure.

**Source.** The same compare-free cleanup used by D2.

**Judgment.** This is the user-facing recoverability consequence of D2.

## Invariants that hold

The current model found no counterexample for these 26 promises:

- A2 `A2_NoPromptAfterCancel`
- A3 `A3_IntentBeforePrompt`
- A4 `A4_HashReplacesIntent`
- A6 `A6_RevertRetryRequiresSourceOwnership`
- A7 `A7_RejectionDropsOnlyIntent`
- B1 `B1_BatchUsesFreshSource`
- B2 `B2_NoStaleAuthorityRestored`
- B3 `B3_LiveSubregistryIsPreserved`
- B4 `B4_LockedNameKeepsRecordControl`
- B5 `B5_PlannedWorkHasRequiredRoles`
- C1 `C1_CompletionRequiresReceiptProof`
- C2 `C2_EvidenceDeletedOnlyAfterCheckpoint`
- C3 `C3_NameActionIsImmutable`
- C6 `C6_HistoricalEvidenceNeverResubmits`
- D4 `D4_CleanupOnlyRecoveryCanFinish`
- D5 `D5_UncertaintyKeepsEvidenceAndBlocksPrompt`
- E1 `E1_NameAndTreeAreAtomic`
- E2 `E2_RecordReplayRunsAtMostOnce`
- E3 `E3_EveryNonNullClassificationHasOneBucket`
- E4 `E4_CopyRequiresRoute`
- E5 `E5_UnknownLabelsNeedConsentAndCap`
- F1 `F1_RenewalIsFundedAndSingle`
- G1 `G1_RunTerminatesUnderFairResponses`
- G2 `G2_PendingAttemptEventuallyResolves`
- G3 `G3_RetryOfferedOnlyWhenUseful`
- G4 `G4_ProgressMatchesEveryPrompt`

B5 now models only a real frontend dependency. A locked wrapper root that has
subname work needs the registrar role. The frontend plans and verifies that
required role. Extra unrelated role bits do not violate B5.

E3 now excludes the intentional `null` classifications listed in
`classifyNames.ts`, including registrant mismatch, another wrapped owner,
non-`.eth` names, and subname registry-owner mismatch. Every non-null result must
enter exactly one `classified` or `ineligible` bucket.

These are bounded model results. They are not substitutes for unit tests or an
end-to-end wallet run.

## Sensitivity results

`Hardened.cfg` completed with 124 generated states, 81 distinct states, and no
error. Every removed guard produced TLC exit code 12 and named its intended
invariant.

The changed mutation configurations are:

| Mutation config | Expected failure |
| --- | --- |
| `NoRequiredRoleDependency.cfg` | B5 |
| `NoTruthfulOutcomeAndRefresh.cfg` | C5 |
| `NoNonNullClassificationPartition.cfg` | E3 |
| `NoChainedPlanSimulation.cfg` | E7 |

The other 33 mutation configurations remain unchanged and pass the same
sensitivity rule. The removed frontend configurations are
`NoExactRoleVerification.cfg`, `NoCertifiedRegistryTraversal.cfg`, and
`NoTotalClassification.cfg`.

## Real-code checks

The green matrix in
`apps/manager/verification/migration/real-code-matrix.test.ts` passed 23 cases:

- all seven normal migrate and copy token categories;
- selected-root, valid copy-route, and missing-copy-route totals;
- five representative non-null classifications, each in exactly one bucket;
- four intentional null classifications, each excluded from both buckets;
- four journal-operation reconciliation combinations.

Seven additive regression witnesses fail as intended:

1. same-scope concurrent executions call `startTransaction` twice;
2. a rehydrated retry keeps `bob.eth` in `classified` but loses its batch;
3. an unavailable journaled receipt permits a fresh submission;
4. stale recovery cleanup deletes a newer snapshot;
5. a partial result reaches `success` instead of `partial-success`;
6. a failed run with completed names skips query invalidation, recent-name
   recording, and NFT evidence;
7. setup and all planned batches do not call one chained `simulateCalls` before
   the first wallet prompt.

The complete runner requires these exact witnesses to stay red until production
behavior changes in a separate commit.

## Contract result

`MigrationContract.tla` exports the lifecycle state, actions, environment
assumptions, and guarantees. The environment now assumes:

- exact fuse-derived roles;
- certified registry traversal;
- honest journal, chain, and wallet responses;
- fair enabled responses.

The certified traversal assumption is explicitly marked "requires
contracts-level FV proof". Neither B5 exact equality nor B6 is a frontend
invariant.

`Model.tla` maps its integrated `CORE` state to the contract and uses `INSTANCE
MigrationContract`. `Contract.cfg` completed with 16 generated states, 15
distinct states, depth 15, and no error.

## Commands run

- baseline `formal/verify-migration.sh` before edits;
- `apps/manager/verification/migration/verify-sensitivity.sh` after the
  verifier-first model and config changes;
- each new C5 and E7 witness in isolation, confirming the expected failure;
- `pnpm exec vitest run --maxWorkers=4 verification/migration/real-code-matrix.test.ts`;
- revised `formal/verify-migration.sh`;
- `pnpm typecheck` from `apps/manager`;
- pstack `statechart` in an external scratch directory.

The final verifier run passed. The statechart reached 82 current states and
reported the same 11 violations and 26 holds listed above.

## Open questions

No frontend product decision remains open in this revision. One external proof
obligation remains: the contracts-level formal-verification owner and artifact
for certified registry traversal must be identified before callers treat that
assumption as discharged.
