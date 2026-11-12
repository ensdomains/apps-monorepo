# Code map - apps/manager migration flow at origin/main 6977db2d7 (2026-11-12 00:28 UTC+8)
Archived copy: /workspace/fv-migration/raw/fv-research/apps/manager/src/features/{migration,dashboard}

UI machine: apps/manager/src/features/migration/state/migrationUi.machine.ts
- context L89-93: managerRestorationNames default empty (opt-in)
- runMigration actor L281-333: submissionGate AbortController; ignores events after cancel
- guards: hasSelection L337-340 (classified non-empty or requiresReconciliation), isOnlyFailures L341-345, renewAndStart L574-580 (quote items>0, domains>0, balance>=total)
- actions: appendBatchComplete throws if a name's action changes L463-466; recordCompletion L497-503; resetForRetry L518-545 (adjustPlanForRetry(plan, completedNames), reconcileBeforeSubmit=true)
- states: select -> migrate.{renewing, preparing, running, landing, reuniting, failing} -> success | failure; failure.retry guards L756-775 via canRetryMigration; global migration.failed -> failure

Service: service/migrationService.ts
- submitRequest L589-626: gate.throwIfAborted L596; onSubmitted(hash) before wait; RECEIPT_TIMEOUT_MS=300000 (L508, L617-620); non-success receipt throws "reverted"
- getSubmittedBatchReceipt L1513-1529: any getTransactionReceipt error -> SubmittedAtomicMigrationIndeterminateError (no getTransaction distinction; MM-039)
- reconcileSubmittedAtomicBatch L1554+: reverted -> assertSourceTokensOwnedForRetry then remove submission+intent (L1568-1576); success -> verify expectations
- reconcileJournaledSubmission L1659-1687: assertJournaledSubmissionMatchesPlan outside fallback; indeterminate + allowStateFallback -> 'unresolved'
- reconcileMigrationRetry ~L1926, assertSourceTokensOwnedForRetry ~L1864
- commitReconciliationJournal L2239-2270: persist recovery plan before deleting evidence
- replayWalletRecords ~L2363-2412 (walletReplayAlreadyApplied skip; wallet prompt before intent - MM-050)
- executeRemainingAtomicBatches L2414-2562: per batch buildNextAtomicBatch -> assertCopyMigrationReadiness + assertSupportedSubnameMigration (L2438-2454) -> replay -> assertSubnameRecreationUnchanged -> gate.throwIfAborted (L2479) -> persistPendingAtomicMigrationAttempt (intent+recovery before prompt) -> submit; onSubmitted persists hash, removes previous hash, removes intent (L2489-2505); after receipt assertSubnameRecreationUnchanged(own tx) + verifyAtomicMigrationBatch at receipt.blockNumber (L2524-2528) -> persistMigrationCompletionCheckpoint -> persistRecoveryPlan(nextRemaining) BEFORE removeSubmittedAtomicMigrationBatch (L2529-2545); user rejection without hash removes intent only (L2554-2556)
- executeMigration L2590-2797: assertSubnameRecreationSnapshotCurrent -> assertTemporaryRegistrationRecoveryScope -> reconcileTemporaryRegistrationApproval -> prepareExecutionPlan; if names remain: assertLockedMigrationResolversUnchanged (L2663) -> assertAtomicBatchingAvailable -> assertNoLiveSubregistryOverwrite (L2678, WEB-1249) -> assertCopyMigrationReadiness -> assertMigrationApprovalPlanCurrent (L2703-2707) -> ensureMigrationSetup -> persistRecoveryPlan (durable copy) -> executeRemainingAtomicBatches; requiresFreshDeploymentPreview -> releaseChangedHelperRecovery + PlanChanged (L2734-2744); historical deployment checkpoint restore or MigrationHistoricalDeploymentError "No names will be submitted again" (L2745-2772); clearCompletedRecoveryPlanJournal; dedupe results by name

Other service files:
- migrationBatchJournal.ts: localStorage journal per scope (chainId, owner, hca): intents, submissions, recovery snapshot; no cross-tab CAS on main (MM-019)
- verifyAtomicMigrationBatch.ts: name-owner-roles hasRoles L369 (subset; MM-009), wrapper-root-roles hasRoles L412 (MM-010), manager-role exact roles() L524 (#1529); registry paths resolved without per-step expected registry (MM-032)
- migrationInvariants.ts: assertNoLiveSubregistryOverwrite L396-420; HCA readiness L510; resolver readiness L591
- buildAtomicMigrationBatches.ts L1608-1612: "A name is never split across outer calls"
- buildMigrationPlan.ts adjustPlanForRetry L1233-1275; L1268 remainingClassified.includes (object identity - MM-002)
- decodeMigrationError.ts L331-332 canRetryMigration = type !== 'plan-changed'; CopyMigrationReadinessError -> plan-changed
- copyMigrationReadiness.ts: recordedAttemptNames exempt names already attempted (L420-427, L558-564, L842-882)
- subnameRecreation.ts: assertSubnameRecreationUnchanged L780, assertSupportedSubnameMigration L892, unknown-label leaves skipped L724/L900 ("dropped, not lost")
- graceRenewal.ts / graceRenewalPending.ts (Web Lock L136 for pending renewal), wrapperSync.ts, migrationCompletionCheckpoint.ts
- hooks/useMigrationRecoverySnapshot.ts: discards recovery by scope from an effect (MM-024)
- pages/MigrationPage.tsx L441-457: invalidateMigrationQueries only on success (MM-007)
- Only Web Locks in migration on main: commemorative-nft/claimSubmissionLock.ts, graceRenewalPending.ts. No execution run lock (MM-001).

Classification: packages/migration/src/service/classifyNames.ts
- classifyName L519; tokenTypes migrate: unwrapped, unlocked, locked-2ld, locked-child, detached-child; copy: unlocked-child, registry-child
- ineligible: not-transferable, unsupported-resolver, unknown-label, invalid-label, missing-parent, expired-registration, parent-upgraded, locked-parent ...
- copyRouteGap L588-607: copy must chain to a copy root (unwrapped/unlocked .eth 2LD being migrated)

Merged migration PRs on main: #1494 46b457d8d, #1520 13eabac62, #1522 407ee82a0, #1526 ac22f4e78, #1529 740bcf504, #1530 4f9dd5be6, #1531 3e71c3136, #1536 7c7c00b33, #1594 154ec710e, #1605 2c8be9eff, #1615 1fd7cb7bf, #1670 273db26d8, #1712 93b2096a8, #1728 edb4b2d99, #1758 6260f162d. #1588 (run lock) closed unmerged.
