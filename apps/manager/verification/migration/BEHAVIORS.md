# ENS manager migration behaviors

## Purpose and workflow

This file is the human-editable source of truth for what the frontend migration
model checks. The model follows this document.

To change a promise, edit the behavior here first. Then update `Model.tla`,
`MigrationContract.tla` when the contract boundary changes, the matching
`No<Guard>.cfg` mutation, and the real-code tests. Record the decision in that
behavior's decision history here.

### Frontend scoping rule

The frontend does not re-verify behavior enforced by the contracts unless a
later frontend action depends on that behavior. Contract-only requirements live
under [Contract assumptions](#contract-assumptions).

Statuses describe the synchronized production commit recorded in `README.md` and
`current-expectations.tsv`.

## A. Wallet prompts and submission safety

### A1. One execution per scope

At most one migration for the same chain, owner, and HCA may reach a wallet
prompt at a time, including across tabs and remounts.

- **Model invariant:** `A1_OneExecutionPerScope`
- **Mutation:** `NoScopeExecutionLock.cfg`
- **Status on main:** **Violates**
- **Key code refs:** `migrationUi.machine.ts` (`runMigration`),
  `migrationService.ts` (`executeMigration`)
- **Decision history:** 2026-11-12: included as a required cross-tab safety
  promise in the initial model.

### A2. No prompt after cancellation

After the user leaves or the run is cancelled, the migration must not open
another wallet prompt.

- **Model invariant:** `A2_NoPromptAfterCancel`
- **Mutation:** `NoSubmissionAbortGate.cfg`
- **Status on main:** **Holds**
- **Key code refs:** `migrationUi.machine.ts` (`runMigration` abort cleanup),
  `migrationService.ts` (`submissionGate`)
- **Decision history:** 2026-11-12: included in the initial model.

### A3. Durable intent before a prompt

Every atomic-batch wallet prompt must have a durable intent and recovery route
before the prompt opens.

- **Model invariant:** `A3_IntentBeforePrompt`
- **Mutation:** `NoIntentRecoveryBeforePrompt.cfg`
- **Status on main:** **Holds**
- **Key code refs:** `migrationService.ts` (`executeRemainingAtomicBatches`),
  `migrationBatchJournal.ts` (`persistPendingAtomicMigrationAttempt`)
- **Decision history:** 2026-11-12: included in the initial model.

### A4. A hash replaces its intent without a gap

When the wallet returns a transaction hash, the hash must become durable before
the corresponding intent is removed. A submitted transaction must never become
untracked between those writes.

- **Model invariant:** `A4_HashReplacesIntent`
- **Mutation:** `NoHashJournalBeforeIntentDrop.cfg`
- **Status on main:** **Holds**
- **Key code refs:** `migrationService.ts` (`executeRemainingAtomicBatches`),
  `migrationBatchJournal.ts` (`persistSubmittedAtomicMigrationBatch`,
  `removePendingAtomicMigrationIntent`)
- **Decision history:** 2026-11-12: included in the initial model.

### A5. A possibly pending attempt never prompts again

If a journaled transaction has no available receipt, its names stay locked and
no replacement prompt opens until the chain gives a definitive answer. There is
no lock timeout or manual release.

- **Model invariant:** `A5_PendingAttemptNeverReprompts`
- **Mutation:** `NoReceiptAbsenceProof.cfg`
- **Status on main:** **Violates**
- **Key code refs:** `migrationService.ts` (`getSubmittedBatchReceipt`,
  `SubmittedAtomicMigrationIndeterminateError`), `migrationBatchJournal.ts`
- **Decision history:** 2026-11-13: kept the receipt lock with no timeout and no
  manual release. Receipt-wait internals remain outside the model.

### A6. A reverted attempt retries only while the source is owned

A reverted migration may be retried only if the user still owns the required v1
source tokens.

- **Model invariant:** `A6_RevertRetryRequiresSourceOwnership`
- **Mutation:** `NoRevertedSourceOwnership.cfg`
- **Status on main:** **Holds**
- **Key code refs:** `migrationService.ts`
  (`assertSourceTokensOwnedForRetry`, reconciliation paths)
- **Decision history:** 2026-11-12: included in the initial model.

### A7. Rejection without a hash drops only that intent

If the user rejects a prompt before a hash exists, the migration removes only
that unsent intent. Completed work and other recovery evidence remain.

- **Model invariant:** `A7_RejectionDropsOnlyIntent`
- **Mutation:** `NoRejectionIntentCleanup.cfg`
- **Status on main:** **Holds**
- **Key code refs:** `migrationService.ts` (`executeRemainingAtomicBatches`),
  `migrationBatchJournal.ts` (`removePendingAtomicMigrationIntent`)
- **Decision history:** 2026-11-12: included in the initial model.

### A8. Approvals match the preview and temporary access is cleaned up

The migration must request only the approvals shown in the reviewed plan.
Temporary migration authority must not remain active after rejection or after
cleanup is required.

- **Model invariant:** `A8_ApprovalsMatchPreviewAndAreCleaned`
- **Mutation:** `NoApprovalPlanAndCleanup.cfg`
- **Status on main:** **Violates**
- **Key code refs:** `migrationService.ts`
  (`assertMigrationApprovalPlanCurrent`, temporary registration approval
  persistence and cleanup), `migrationApprovals.ts`
- **Decision history:** 2026-11-12: temporary HCA authority was not allowed to
  survive user rejection.

## B. Freshness and authority at submission

### B1. Every batch uses fresh source state

Before each batch reaches the wallet, the migration must re-check source
ownership, copy readiness, supported subnames, and the recreation snapshot. A
change blocks the prompt.

- **Model invariant:** `B1_BatchUsesFreshSource`
- **Mutation:** `NoPerBatchFreshness.cfg`
- **Status on main:** **Holds**
- **Key code refs:** `migrationService.ts` (`buildNextAtomicBatch`),
  `copyMigrationReadiness.ts` (`assertCopyMigrationReadiness`,
  `assertCopySourcesFresh`), `subnameRecreation.ts`
- **Decision history:** 2026-11-12: included in the initial model.

### B2. Migration never restores stale authority

The migration must restore only authority that is current in v1. Restoring a
manager requires the user's explicit opt-in for that name.

- **Model invariant:** `B2_NoStaleAuthorityRestored`
- **Mutation:** `NoCurrentAuthorityOnly.cfg`
- **Status on main:** **Holds**
- **Key code refs:** `migrationUi.machine.ts` (`managerRestorationNames`),
  `buildAtomicMigrationBatches.ts` (`buildManagerRoleFragment`)
- **Decision history:** 2026-11-12: included in the initial model with manager
  restoration opt-in.

### B3. A live subregistry is preserved

Migration must not replace a live v2 subregistry and detach the subnames already
under it.

- **Model invariant:** `B3_LiveSubregistryIsPreserved`
- **Mutation:** `NoLiveSubregistryGuard.cfg`
- **Status on main:** **Holds**
- **Key code refs:** `migrationInvariants.ts`
  (`assertNoLiveSubregistryOverwrite`), `migrationService.ts`
- **Decision history:** 2026-11-12: included in the initial model.

### B4. A locked name keeps record control

A locked name may be reported complete only if its resolver is certified or the
result still preserves the required record control.

- **Model invariant:** `B4_LockedNameKeepsRecordControl`
- **Mutation:** `NoLockedResolverControl.cfg`
- **Status on main:** **Holds**
- **Key code refs:** `migrationInvariants.ts` (locked resolver checks),
  `buildMigrationPlan.ts` (locked resolver replacement safety),
  `verifyAtomicMigrationBatch.ts`
- **Decision history:** 2026-11-12: included in the initial model.

### B5. Planned work has every role it requires

If later frontend work depends on a role, that role must be present in both the
plan and the verified result. For example, planned subname work under a locked
wrapper root requires the registrar role. Extra unrelated role bits are not a
frontend failure.

- **Model invariant:** `B5_PlannedWorkHasRequiredRoles`
- **Mutation:** `NoRequiredRoleDependency.cfg`
- **Status on main:** **Holds**
- **Key code refs:** `buildAtomicMigrationBatches.ts`
  (`lockedWrapperRootRoleBitmap`, `ROLE_REGISTRAR`),
  `verifyAtomicMigrationBatch.ts`
- **Decision history:** 2026-11-12: narrowed from exact role equality to only
  roles required by later frontend actions. Exact fuse-derived roles moved to a
  contract assumption.

## C. Completion truth

### C1. Completion requires receipt and post-state proof

A name is complete only after a successful receipt and verification of the
planned post-state at that receipt's block.

- **Model invariant:** `C1_CompletionRequiresReceiptProof`
- **Mutation:** `NoReceiptAndPostStateProof.cfg`
- **Status on main:** **Holds**
- **Key code refs:** `migrationService.ts` (`executeRemainingAtomicBatches`),
  `verifyAtomicMigrationBatch.ts`
- **Decision history:** 2026-11-12: included in the initial model.

### C2. Evidence is deleted only after a checkpoint

A submitted transaction may be removed from recovery only after the completed
work is checkpointed and the remaining recovery route is durable.

- **Model invariant:** `C2_EvidenceDeletedOnlyAfterCheckpoint`
- **Mutation:** `NoCheckpointBeforeJournalDelete.cfg`
- **Status on main:** **Holds**
- **Key code refs:** `migrationService.ts` (`commitReconciliationJournal`,
  `executeRemainingAtomicBatches`), `migrationBatchJournal.ts`
- **Decision history:** 2026-11-12: included in the initial model.

### C3. A name's action never changes

A name planned as migrate must not later be treated as copy, and a name planned
as copy must not later be treated as migrate.

- **Model invariant:** `C3_NameActionIsImmutable`
- **Mutation:** `NoImmutableOperationIdentity.cfg`
- **Status on main:** **Holds**
- **Key code refs:** `migrationUi.machine.ts` (`appendBatchComplete`,
  `recordCompletion`), `buildMigrationPlan.ts` (`operation-mismatch` recovery
  checks)
- **Decision history:** 2026-11-12: included in the initial model.

### C4. Complete means all required work is done

The product may claim complete only when migration, grace renewal, wrapper sync,
and cleanup work are all complete and no required work remains.

- **Model invariant:** `C4_CompleteMeansAllRequiredWorkDone`
- **Mutation:** `NoCompleteWorkAccounting.cfg`
- **Status on main:** **Violates**
- **Key code refs:** `commemorative-nft/migrationCompletion.ts`,
  `migrationCompletionCheckpoint.ts`
- **Decision history:** 2026-11-12: completion was defined to include grace
  renewal, wrapper sync, and cleanup.

### C5. Terminal outcomes and refreshed views are truthful

The terminal result is one of success, partial-success,
failed-nothing-landed, or cancelled. Partial-success lists completed and
remaining names, does not play the all-done success animation, and runs the same
query, recent-name, and NFT-evidence refreshes as success for completed work.

- **Model invariant:** `C5_OutcomeAndViewsAreTruthful`
- **Mutation:** `NoTruthfulOutcomeAndRefresh.cfg`
- **Status on main:** **Violates**
- **Key code refs:** `migrationUi.machine.ts` (`isOnlyFailures`, terminal
  transitions), `MigrationPage.tsx` (success-only refresh effect)
- **Decision history:** 2026-11-13: replaced the shared success and failure
  handling with four distinct terminal states and required partial-success
  refresh side effects.

### C6. Historical evidence never causes resubmission

Evidence from an older migration-helper deployment is restored from a valid
checkpoint or blocks the run. It must never cause those names to be submitted
again.

- **Model invariant:** `C6_HistoricalEvidenceNeverResubmits`
- **Mutation:** `NoHistoricalNoResubmit.cfg`
- **Status on main:** **Holds**
- **Key code refs:** `migrationService.ts`
  (`isHistoricalMigrationSubmission`, historical deployment reconciliation),
  `migrationCompletionCheckpoint.ts`
- **Decision history:** 2026-11-12: included in the initial model.

## D. Journal, recovery, and retry

### D1. Retry contains exactly the remaining work

A retry contains every operation that has not completed and none of the
completed operations. Matching uses the operation's meaning, not JavaScript
object identity.

- **Model invariant:** `D1_RetryKeepsExactlyRemainingWork`
- **Mutation:** `NoSemanticRetryIdentity.cfg`
- **Status on main:** **Violates**
- **Key code refs:** `buildMigrationPlan.ts` (`adjustPlanForRetry`,
  `remainingClassified.includes`), `migrationUi.machine.ts` (`resetForRetry`)
- **Decision history:** 2026-11-12: included in the initial model.

### D2. A recorded attempt never loses recovery

While an intent exists, recovery must still cover that intent. Stale cleanup
must not delete a newer snapshot written for the same scope.

- **Model invariant:** `D2_AttemptNeverLosesRecovery`
- **Mutation:** `NoSnapshotCleanupCompare.cfg`
- **Status on main:** **Violates**
- **Key code refs:** `useMigrationRecoverySnapshot.ts`,
  `migrationBatchJournal.ts` (`removeMigrationRecoverySnapshot`)
- **Decision history:** 2026-11-12: included in the initial model.

### D3. Concurrent journal writes do not lose updates

Concurrent tabs writing the same scope must preserve every intent and
submission instead of overwriting one writer with another.

- **Model invariant:** `D3_ConcurrentJournalWritesDoNotLoseUpdates`
- **Mutation:** `NoJournalAtomicWrite.cfg`
- **Status on main:** **Violates**
- **Key code refs:** `migrationBatchJournal.ts` (journal read-modify-write
  persistence), `migrationService.ts`
- **Decision history:** 2026-11-12: included in the initial model under the
  one-run-per-scope concurrency requirement.

### D4. Cleanup-only recovery can finish

If all names are complete but authority or evidence cleanup remains, the user
can run that cleanup and reach success.

- **Model invariant:** `D4_CleanupOnlyRecoveryCanFinish`
- **Mutation:** `NoCleanupOnlyRunnable.cfg`
- **Status on main:** **Holds**
- **Key code refs:** `migrationUi.machine.ts` (`hasSelection`,
  `requiresReconciliation`), `migrationService.ts` (cleanup paths)
- **Decision history:** 2026-11-12: included in the initial model.

### D5. Uncertainty keeps evidence and blocks new prompts

When reconciliation cannot determine what happened, the migration retains the
submission and recovery evidence, marks the names blocked, and opens no new
prompt.

- **Model invariant:** `D5_UncertaintyKeepsEvidenceAndBlocksPrompt`
- **Mutation:** `NoUncertaintyRetainsEvidence.cfg`
- **Status on main:** **Holds**
- **Key code refs:** `migrationService.ts`
  (`SubmittedAtomicMigrationIndeterminateError`, reconciliation paths),
  `migrationBatchJournal.ts`
- **Decision history:** 2026-11-12: included in the initial model. 2026-11-13:
  aligned with the no-timeout receipt-lock decision.

## E. Atomicity and plan totality

### E1. A name and its subname tree are atomic

A name's migration operations and its recreation tree land in one outer atomic
call or not at all. A tree that cannot fit is refused rather than split.

- **Model invariant:** `E1_NameAndTreeAreAtomic`
- **Mutation:** `NoAtomicNameTree.cfg`
- **Status on main:** **Holds**
- **Key code refs:** `buildAtomicMigrationBatches.ts` (tree grouping,
  `findLargestAtomicPrefixWithinGasLimit`, partial-tree refusal)
- **Decision history:** 2026-11-12: included in the initial model.

### E2. Wallet record replay runs at most once

After wallet-owned records are successfully replayed, a retry must not replay
them again.

- **Model invariant:** `E2_RecordReplayRunsAtMostOnce`
- **Mutation:** `NoReplayDeduplication.cfg`
- **Status on main:** **Holds**
- **Key code refs:** `migrationService.ts` (`walletReplayAlreadyApplied`, wallet
  replay execution)
- **Decision history:** 2026-11-12: included in the initial model.

### E3. Every non-null classification has one bucket

Every non-null classifier result enters exactly one bucket: classified or
ineligible with a reason. Results that intentionally classify to `null`, such as
another registrant, another wrapped owner, a non-`.eth` name, or a registry-owner
mismatch, are excluded from both buckets.

- **Model invariant:** `E3_EveryNonNullClassificationHasOneBucket`
- **Mutation:** `NoNonNullClassificationPartition.cfg`
- **Status on main:** **Holds**
- **Key code refs:** `packages/migration/src/service/classifyNames.ts`
  (`classifyName`, `classifyNames`)
- **Decision history:** 2026-11-13: narrowed totality to non-null classifier
  results and confirmed that null classifications are intentional exclusions.

### E4. Copy requires a valid route

A copy operation is eligible only when its ancestor chain reaches a migrated
copy root in the plan or in already completed work.

- **Model invariant:** `E4_CopyRequiresRoute`
- **Mutation:** `NoCopyRouteGuard.cfg`
- **Status on main:** **Holds**
- **Key code refs:** `packages/migration/src/service/classifyNames.ts`
  (`copyRouteGap`, `isCopyRoot`)
- **Decision history:** 2026-11-12: included in the initial model.

### E5. Unknown-label loss requires consent and stays within the cap

Unknown-label leaf subnames may be left behind only after explicit user consent,
and no more than five may be left behind for a parent.

- **Model invariant:** `E5_UnknownLabelsNeedConsentAndCap`
- **Mutation:** `NoUnknownLabelConsentCap.cfg`
- **Status on main:** **Holds**
- **Key code refs:** `packages/migration/src/service/subnameMigrationImpact.ts`
  (`MAX_UNRECOVERABLE_SUBNAMES`), `rpcSubnameMigrationImpact.ts`,
  `useSubnameMigrationConfirmation.ts`, `subnameRecreation.ts`
- **Decision history:** 2026-11-12: set explicit consent and a maximum of five
  unknown-label leaves.

### E6. Expiry uses chain time or fails closed

An expiry decision must use chain time. If the frontend cannot establish that
chain-time condition, it must not open a migration prompt for the name.

- **Model invariant:** `E6_ExpiryUsesChainTimeOrFailsClosed`
- **Mutation:** `NoChainTimeExpiry.cfg`
- **Status on main:** **Violates**
- **Key code refs:** `packages/migration/src/service/classifyNames.ts`
  (`Date.now()` defaults), `copyMigrationReadiness.ts` (submit-time expiry
  checks), `estimateGraceRenewalMigrationGas.ts`
- **Decision history:** 2026-11-12: included in the initial model.

### E7. The full plan simulates before the first prompt

Setup and every batch must pass one ordered, state-chained live simulation before
the first wallet prompt. Each batch must still pass its live `estimateGas`
re-check before submission. After simulation, failure may come only from
rejection, a state race, or a dropped transaction, and the resulting state must
be recoverable and truthful.

- **Model invariant:** `E7_AllCallsSimulateBeforeFirstPrompt`
- **Mutation:** `NoChainedPlanSimulation.cfg`
- **Status on main:** **Violates**
- **Key code refs:** `buildMigrationPlan.ts` (`previewBatchGas`),
  `migrationService.ts` (`buildNextAtomicBatch`, `firstBatchOnly`),
  `estimateGraceRenewalGas.ts` (`simulateCalls` precedent)
- **Decision history:** 2026-11-13: added ordered chained simulation before the
  first wallet prompt while retaining the per-batch live estimate.

## F. Grace renewal

### F1. Grace renewal is funded and single

A grace renewal starts only when the wallet has enough balance, and only one
renewal for the scope may be active.

- **Model invariant:** `F1_RenewalIsFundedAndSingle`
- **Mutation:** `NoRenewalFundingAndLock.cfg`
- **Status on main:** **Holds**
- **Key code refs:** `migrationUi.machine.ts` (renewal start guard),
  `graceRenewal.ts` (balance re-check), `graceRenewalPending.ts` (exclusive
  cross-tab lock)
- **Decision history:** 2026-11-12: included in the initial model.

## G. Liveness and user-visible progress

### G1. A fair run reaches a terminal state

When wallet, RPC, and chain responses continue fairly, a run does not remain in
running forever. It settles as success, failure, or blocked.

- **Model invariant:** `G1_RunTerminatesUnderFairResponses`
- **Mutation:** `NoFailureRouting.cfg`
- **Status on main:** **Holds**
- **Key code refs:** `migrationUi.machine.ts` (`migration.complete`,
  `migration.failed`, terminal transitions), `migrationService.ts`
- **Decision history:** 2026-11-12: included in the initial model under fair
  responses.

### G2. A pending attempt resolves under fair chain responses

When the chain eventually answers, a pending attempt leaves the unresolved set
and exposes useful retry or completion progress. A permanently unavailable
receipt may remain blocked because the product has no timeout or manual release.

- **Model invariant:** `G2_PendingAttemptEventuallyResolves`
- **Mutation:** `NoFairPendingResolution.cfg`
- **Status on main:** **Holds**
- **Key code refs:** `migrationService.ts` (`getSubmittedBatchReceipt`,
  reconciliation), `MigrationContract.tla` (`FairResponses`)
- **Decision history:** 2026-11-13: kept liveness conditional on fair chain
  responses and retained indefinite locking while the receipt remains
  unavailable.

### G3. Retry is offered only when useful

The UI must not offer retry for a deterministic failure that requires a new plan
or other user action before the migration could succeed.

- **Model invariant:** `G3_RetryOfferedOnlyWhenUseful`
- **Mutation:** `NoRetryEligibility.cfg`
- **Status on main:** **Holds**
- **Key code refs:** `decodeMigrationError.ts` (`canRetryMigration`),
  `migrationUi.machine.ts` (failure retry guards)
- **Decision history:** 2026-11-12: included in the initial model.

### G4. Progress counts every wallet prompt

At settlement, progress reaches its total exactly, and the total equals the
wallet prompts that the run actually required, including live batch changes and
record replay.

- **Model invariant:** `G4_ProgressMatchesEveryPrompt`
- **Mutation:** `NoDynamicProgressAccounting.cfg`
- **Status on main:** **Holds**
- **Key code refs:** `migrationProgress.ts`, `buildStepDescriptors.ts`,
  `migrationUi.machine.ts` (progress updates)
- **Decision history:** 2026-11-12: included in the initial model.

### G5. Recovery never silently disappears

Every reachable recovery state settles as done or blocked with its evidence
retained. An outstanding intent must remain covered by recovery, and useful
evidence must not disappear without an explicit outcome.

- **Model invariant:** `G5_RecoveryNeverSilentlyDisappears`
- **Mutation:** `NoRecoverability.cfg`
- **Status on main:** **Violates**
- **Key code refs:** `useMigrationRecoverySnapshot.ts`,
  `migrationBatchJournal.ts` (`removeMigrationRecoverySnapshot`),
  `reconcileMigrationRecovery.ts`
- **Decision history:** 2026-11-12: included as the user-facing recovery
  consequence of checkpoint, uncertainty, and stale-cleanup rules.

## Contract assumptions

`MigrationContract.tla` treats these as environment assumptions. The frontend
model may rely on them, but they are not frontend behaviors unless a later
frontend action creates a dependency such as B5.

- **Non-empty domains:** `Tabs` and `Names` are non-empty, and the environment
  flags are booleans.
- **Honest journal:** `HonestJournal` means stored journal evidence is honest,
  though reads and writes may race.
- **Honest chain:** `HonestChain` means chain responses are honest.
- **Honest wallet:** `HonestWallet` means wallet responses are honest.
- **Fair responses:** `FairResponses` supplies progress for enabled responses.
  It does not create a product timeout when a receipt remains unavailable.
- **Valid contract state:** `TypeOK` constrains every mapped contract-state
  field to its declared domain.
- **Exact fuse-derived roles:** `ExactFuseDerivedRolesAssumption` says the
  contract's actual role set equals the role set derived from the name's fuses.
  Frontend B5 checks only a later frontend dependency on those roles.
- **Certified registry path, B6:** `CertifiedRegistryPathAssumption` says every
  registry traversal uses the certified registry path. Its contracts-level
  theorem goal is `CertifiedRegistryPath` in the proof stub
  `CertifiedRegistryPathProof.tla`. The contracts-level proof owner and final
  proof artifact are TBD. Until that artifact exists, this remains assumed, not
  proved.

Decision history for the contract boundary:

- 2026-11-12: exact fuse-derived role equality moved from frontend B5 to a
  contract assumption.
- 2026-11-12: B6 certified registry traversal moved from the frontend invariant
  set to a contract assumption that requires contracts-level formal proof.
- 2026-11-13: `CertifiedRegistryPathProof.tla` was added as the explicit proof
  stub, with owner and artifact still TBD.

## Open questions

- Who owns the contracts-level certified registry path proof, and which checked
  artifact will replace the stub in `CertifiedRegistryPathProof.tla`?
