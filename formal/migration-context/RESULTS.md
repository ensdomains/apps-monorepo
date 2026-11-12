# ENS manager migration formal-verification trial results

## Verdict

At production commit `6977db2d7d14a8d6c48436d97d4fee6ed703285b`, the
finite current-code model violates 13 of the 37 required migration promises.
The other 24 hold in the modeled scenarios.

The hardened model passes. All 37 single-guard mutation configurations fail the
intended invariant with TLC exit code 12. The integrated migration behavior also
refines and satisfies `MigrationContract.tla`.

No production code or existing assertion was changed. Four additive real-code
regressions remain intentionally red and are treated as expected findings by
`formal/verify-migration.sh`.

## Inputs and assumptions

The trial used the seven supplied defaults without modification:

1. Model `origin/main` as-is, not the unmerged `mm` branches.
2. The localStorage journal and RPC are honest but racy, not adversarial.
3. One run per scope `(chain, owner, HCA)` across tabs is required.
4. A missing receipt keeps names locked until the chain answers. There is no
   product timeout.
5. A temporary HCA grant may not stay live after a user rejection.
6. Complete includes grace renewal, wrapper sync, and cleanup.
7. Dropping at most five unknown-label subnames is allowed only with explicit
   consent.

Additional modeling assumptions:

- wallet and chain responses are honest;
- under the liveness checks, enabled wallet, RPC, and chain responses are fair;
- a permanently unavailable chain answer can leave the user blocked, consistent
  with the no-timeout default;
- contract execution inside one submitted outer call is atomic;
- Solidity internals, gas estimation, Safe settlement, and indexer correctness
  are outside this model;
- each scenario is exhaustive within its finite abstraction, but the model does
  not take the full cross-product of all 37 scenarios.

## Violated invariants

### A1 `A1_OneExecutionPerScope`

**Shortest trace:** one tab reaches the wallet prompt. A second tab starts the
same `(chain, owner, HCA)` scope and also reaches a prompt. The scope now has two
concurrent executions.

**Source:** `apps/manager/src/features/migration/service/migrationService.ts:2590`
starts `executeMigration` without a per-scope wrapper. The repository has
cross-tab locks for grace renewal at
`apps/manager/src/features/migration/service/graceRenewalPending.ts:126` and NFT
claim submission, but not for the main migration execution.

**Judgment:** real bug under the supplied concurrency requirement, not a model
artifact. The additive test observed two `startTransaction` calls where one was
allowed.

### A5 `A5_PendingAttemptNeverReprompts`

**Shortest trace:** a previous hash is journaled. Its receipt read is
unavailable. Current fallback uses post-state reconciliation, clears the
uncertainty, and opens a new wallet prompt even though the old transaction may
still land.

**Source:** receipt errors become indeterminate at
`apps/manager/src/features/migration/service/migrationService.ts:1513`; the
retry fallback converts that error to `unresolved` at
`apps/manager/src/features/migration/service/migrationService.ts:1679`.

**Judgment:** real duplicate-submission risk under the no-timeout and
receipt-absence defaults. The additive test observed a successful new submission
instead of a blocking indeterminate error.

### A8 `A8_ApprovalsMatchPreviewAndAreCleaned`

**Shortest trace:** migration setup grants temporary registration authority.
The later migration wallet prompt is rejected. Current rejection handling drops
the pending batch intent but leaves the temporary grant live.

**Source:** temporary approval state is persisted at
`apps/manager/src/features/migration/service/migrationService.ts:1038`; the
batch rejection path at
`apps/manager/src/features/migration/service/migrationService.ts:2554` removes
only the unsent intent.

**Judgment:** real requirement violation under the supplied decision that a
temporary HCA grant may not survive rejection. Existing tests explicitly
document the current leave-it-for-the-permissions-page behavior.

### B5 `B5_ExactlyPlannedRoles`

**Shortest trace:** the planned role bits are present after migration, but an
extra owner or wrapper-root role bit is also present. Verification accepts the
subset and reports success.

**Source:** owner and wrapper-root expectations call `hasRoles` at
`apps/manager/src/features/migration/service/verifyAtomicMigrationBatch.ts:369`
and `apps/manager/src/features/migration/service/verifyAtomicMigrationBatch.ts:412`.
The exact manager-role path is separate.

**Judgment:** real hardening requirement gap, not an invariant-mirroring
artifact. The practical severity depends on how excess roles could arise in an
honest chain state.

### B6 `B6_VerificationUsesCertifiedRegistryPath`

**Shortest trace:** registry traversal follows the live `getSubregistry` result
without proving that each intermediate registry is the expected certified
registry. A foreign path can therefore satisfy the final read in the model.

**Source:** `resolveSubregistry` follows each returned address at
`apps/manager/src/features/migration/service/verifyAtomicMigrationBatch.ts:196`
without comparing intermediate registries with certified expected addresses.

**Judgment:** specification-sensitive hardening gap. It is not a model artifact
because the required binding is absent, but this trial did not prove that the
foreign intermediate state is reachable under current production contracts.

### C4 `C4_CompleteMeansAllRequiredWorkDone`

**Shortest trace:** token migration is verified, while grace renewal, wrapper
sync, and temporary-authority cleanup remain. The dashboard or commemorative
completion check still claims complete.

**Source:** the NFT completion decision at
`apps/manager/src/features/migration/commemorative-nft/migrationCompletion.ts:189`
uses remaining migratable names and migrated-name evidence. It does not account
for all grace, wrapper-sync, and cleanup work in the supplied completion
definition.

**Judgment:** real product-definition gap under default 6, not a model artifact.

### C5 `C5_OutcomeAndViewsAreTruthful`

**Shortest trace:** one name completes and one remains. Current behavior routes
the run to failure rather than a distinct partial outcome, and the migration
queries are not refreshed on that failure path.

**Source:** failure routing uses `isOnlyFailures` at
`apps/manager/src/features/migration/state/migrationUi.machine.ts:341`; query
invalidation runs only when `step === 'success'` at
`apps/manager/src/features/migration/pages/MigrationPage.tsx:441`.

**Judgment:** real UI-state and stale-view bug. The exact desired presentation
of partial completion remains a product question, but the current stale cache
is independently incorrect.

### D1 `D1_RetryKeepsExactlyRemainingWork`

**Shortest trace:** a failed plan is rehydrated into equivalent classified-name
objects. The retry removes the completed name by semantic identity, but filters
batch executions by object identity. The remaining name disappears from the
batch.

**Source:**
`apps/manager/src/features/migration/service/buildMigrationPlan.ts:1268` uses
`remainingClassified.includes(execution.classified)`.

**Judgment:** real latent defect, not a model artifact. The additive test
observed `bob.eth` in `classified` but an empty retry batch. Current control flow
may often retain object identity, which limits present reachability rather than
making the helper correct.

### D2 `D2_AttemptNeverLosesRecovery`

**Shortest trace:** an effect reads an unused recovery snapshot. Before its
cleanup runs, another execution writes a newer useful snapshot for the same
scope. The stale effect deletes by scope and removes the newer snapshot.

**Source:**
`apps/manager/src/features/migration/hooks/useMigrationRecoverySnapshot.ts:85`
removes by discarded scope; the journal removal operation starts at
`apps/manager/src/features/migration/service/migrationBatchJournal.ts:970` and
does not compare the expected snapshot.

**Judgment:** real race. The additive test observed `null` instead of the newer
snapshot.

### D3 `D3_ConcurrentJournalWritesDoNotLoseUpdates`

**Shortest trace:** two tabs read the same journal. Each adds its own intent and
writes the whole journal. The second write overwrites the first, leaving only
one recoverable attempt.

**Source:** journal mutation is read-modify-write around
`apps/manager/src/features/migration/service/migrationBatchJournal.ts:832` and
the persistence functions beginning at lines 944, 994, and 1089. There is no
compare-and-swap or per-scope write lock.

**Judgment:** real cross-tab lost-update bug under default 3. No separate
real-code regression was added because deterministically interleaving browser
localStorage writers would require a larger harness than the direct helper and
hook witnesses.

### E3 `E3_EveryNameHasOneBucket`

**Shortest trace:** a selected domain returns no classification result. The
bulk classifier silently continues, so the name is neither migratable, copyable,
nor ineligible with a reason.

**Source:** `classifyName` can return `null`, including for a missing label, at
`packages/migration/src/service/classifyNames.ts:519`; `classifyNames` drops the
result at `packages/migration/src/service/classifyNames.ts:613`.

**Judgment:** real totality gap in the helper contract. The passing real-code
matrix proves the seven normal token categories and copy-route cases, but this
trial did not establish which honest production query shape reaches the null
case.

### E6 `E6_ExpiryUsesChainTimeOrFailsClosed`

**Shortest trace:** the browser clock says a registration or wrapper has not
expired while chain time says it has. Classification proceeds from browser
time.

**Source:** default classification time uses `Date.now()` at
`packages/migration/src/service/classifyNames.ts:524` and line 574. Related
submit-time checks also use browser time at
`apps/manager/src/features/migration/service/copyMigrationReadiness.ts:196` and
line 514.

**Judgment:** real requirement gap. Several call sites can fail closed later,
which reduces severity, but the decision is not based on chain time as required.

### G5 `G5_RecoveryNeverSilentlyDisappears`

**Shortest trace:** useful recovery becomes visible, then a stale cleanup effect
removes it without the attempt reaching success or an explicit unrecoverable
failure.

**Source:** the same compare-free cleanup at
`apps/manager/src/features/migration/hooks/useMigrationRecoverySnapshot.ts:85`
and `apps/manager/src/features/migration/service/migrationBatchJournal.ts:970`.

**Judgment:** real recoverability bug. This is the user-facing liveness
consequence of the D2 stale-snapshot race, not a separate code defect.

## Invariants that hold

The current model found no counterexample for these 24 promises:

- A2 `A2_NoPromptAfterCancel`
- A3 `A3_IntentBeforePrompt`
- A4 `A4_HashReplacesIntent`
- A6 `A6_RevertRetryRequiresSourceOwnership`
- A7 `A7_RejectionDropsOnlyIntent`
- B1 `B1_BatchUsesFreshSource`
- B2 `B2_NoStaleAuthorityRestored`
- B3 `B3_LiveSubregistryIsPreserved`
- B4 `B4_LockedNameKeepsRecordControl`
- C1 `C1_CompletionRequiresReceiptProof`
- C2 `C2_EvidenceDeletedOnlyAfterCheckpoint`
- C3 `C3_NameActionIsImmutable`
- C6 `C6_HistoricalEvidenceNeverResubmits`
- D4 `D4_CleanupOnlyRecoveryCanFinish`
- D5 `D5_UncertaintyKeepsEvidenceAndBlocksPrompt`
- E1 `E1_NameAndTreeAreAtomic`
- E2 `E2_RecordReplayRunsAtMostOnce`
- E4 `E4_CopyRequiresRoute`
- E5 `E5_UnknownLabelsNeedConsentAndCap`
- F1 `F1_RenewalIsFundedAndSingle`
- G1 `G1_RunTerminatesUnderFairResponses`
- G2 `G2_PendingAttemptEventuallyResolves`
- G3 `G3_RetryOfferedOnlyWhenUseful`
- G4 `G4_ProgressMatchesEveryPrompt`

These are bounded model results. They are not a substitute for the existing
unit tests or an end-to-end browser and wallet run.

## Sensitivity results

`Hardened.cfg` completed with 113 generated states, 76 distinct states, and no
error. Every removed guard produced TLC exit code 12 and named the intended
invariant:

| Mutation config | Expected failure |
| --- | --- |
| `NoScopeExecutionLock.cfg` | A1 |
| `NoSubmissionAbortGate.cfg` | A2 |
| `NoIntentRecoveryBeforePrompt.cfg` | A3 |
| `NoHashJournalBeforeIntentDrop.cfg` | A4 |
| `NoReceiptAbsenceProof.cfg` | A5 |
| `NoRevertedSourceOwnership.cfg` | A6 |
| `NoRejectionIntentCleanup.cfg` | A7 |
| `NoApprovalPlanAndCleanup.cfg` | A8 |
| `NoPerBatchFreshness.cfg` | B1 |
| `NoCurrentAuthorityOnly.cfg` | B2 |
| `NoLiveSubregistryGuard.cfg` | B3 |
| `NoLockedResolverControl.cfg` | B4 |
| `NoExactRoleVerification.cfg` | B5 |
| `NoCertifiedRegistryTraversal.cfg` | B6 |
| `NoReceiptAndPostStateProof.cfg` | C1 |
| `NoCheckpointBeforeJournalDelete.cfg` | C2 |
| `NoImmutableOperationIdentity.cfg` | C3 |
| `NoCompleteWorkAccounting.cfg` | C4 |
| `NoTruthfulOutcomeAndRefresh.cfg` | C5 |
| `NoHistoricalNoResubmit.cfg` | C6 |
| `NoSemanticRetryIdentity.cfg` | D1 |
| `NoSnapshotCleanupCompare.cfg` | D2 |
| `NoJournalAtomicWrite.cfg` | D3 |
| `NoCleanupOnlyRunnable.cfg` | D4 |
| `NoUncertaintyRetainsEvidence.cfg` | D5 |
| `NoAtomicNameTree.cfg` | E1 |
| `NoReplayDeduplication.cfg` | E2 |
| `NoTotalClassification.cfg` | E3 |
| `NoCopyRouteGuard.cfg` | E4 |
| `NoUnknownLabelConsentCap.cfg` | E5 |
| `NoChainTimeExpiry.cfg` | E6 |
| `NoRenewalFundingAndLock.cfg` | F1 |
| `NoFailureRouting.cfg` | G1 |
| `NoFairPendingResolution.cfg` | G2 |
| `NoRetryEligibility.cfg` | G3 |
| `NoDynamicProgressAccounting.cfg` | G4 |
| `NoRecoverability.cfg` | G5 |

This establishes that no hardened guard is vacuous in its dedicated scenario.
It does not establish that the guard is implemented in TypeScript. The current
mapping, source review, and real-code witnesses provide that connection.

## Real-code checks

The green exhaustive matrix in
`apps/manager/verification/migration/real-code-matrix.test.ts` passed 14 cases:

- all seven normal migrate and copy token categories;
- selected-root, valid copy-route, and missing-copy-route totals;
- all four matching, mismatch, and unrelated journal-operation combinations.

Four additive regression witnesses failed as intended:

1. same-scope concurrent executions called `startTransaction` twice;
2. a rehydrated retry retained `bob.eth` in `classified` but lost it from the
   atomic batch;
3. an unavailable journaled receipt resolved into a fresh successful submission
   instead of blocking;
4. stale recovery cleanup deleted a newer snapshot.

The complete runner requires those exact witnesses to stay red until production
behavior is fixed in a separate change.

## Contract result

`MigrationContract.tla` exports:

- the `contractState` record;
- start, intent, prompt, hash, pending, resolution, verification, checkpoint,
  cancellation, cleanup, and completion actions;
- honest journal, chain, and wallet plus fair-response assumptions;
- guarantees for one prompt per scope, cancellation, durable intent, pending
  tracking, verified and checkpointed completion, cleanup, and recovery.

`Model.tla` maps its integrated `CORE` state to that record and uses
`INSTANCE MigrationContract`. `Contract.cfg` checks the refinement mapping,
contract assumptions, and contract guarantees. TLC completed with 16 generated
states, 15 distinct states, depth 15, and no error.

A caller can compose the contract by mapping its concrete state to
`contractState`, using or refining the exported lifecycle actions, and
establishing `EnvironmentAssumptions`. The caller may then rely on `Guarantees`.
If the caller owns wallet or chain progress, it must discharge fair responses;
the contract does not invent a product timeout.

## Commands run

- `apps/manager/verification/migration/verify-sensitivity.sh`
- `formal/verify-migration.sh`
- pstack `/skill:statechart` on the current model in an external scratch
  directory
- `pnpm exec vitest run --maxWorkers=4 verification/migration/real-code-matrix.test.ts`
- each of the four intentionally red Vitest witnesses in isolation
- `pnpm typecheck` from `apps/manager`

The full verifier run passed. The statechart explored 76 current states and
reported the same 13 violated invariants and 24 holding invariants listed above.

## Questions for David

1. For B5, should exact owner and wrapper-root role equality remain a release
   requirement even if excess bits require a pre-existing or otherwise unusual
   chain state?
2. For B6, should each registry hop be certified in production despite the
   earlier triage that treated a foreign intermediate registry as impossible?
3. For C5, does the product need a distinct partial-success state, or is a
   failure state acceptable if it clearly lists completed work and refreshes all
   affected views?
4. For E3, should missing-label or otherwise null classification results become
   explicit `ineligible` reasons, and which reason should the UI show?
5. Default 4 accepts indefinite blocking when the chain never answers. Should
   support tooling provide a manual recovery or escalation path without
   changing the no-automatic-timeout rule?
