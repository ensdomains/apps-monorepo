# herdr/pstack-* exploration branches (raw: /workspace/fv-migration/raw/explore, /workspace/fv-migration/raw/fv-research/herdr)

- pstack-targeted: MigrationRetrySafety.tla - invariants IntentBeforeWalletPrompt, HashReplacesIntent, EveryAdditionalPromptWasAuthorized, SuccessfulAttemptIsNeverResubmitted, CompletionRequiresVerifiedProof, SuccessfulJournalRemovalRequiresCheckpoint, BlockedUncertaintyKeepsRetryEvidence. Passed on all snapshots; MISSED the #1500 locked-resolver regression.
- pr-targeted: LockedResolverMigration, WrapperSyncEligibilityCompletion (found needs-sync name can be counted complete), WrapperSyncTransaction, GraceRenewalBoundary.
- pr-impact-exhaustive: 8 domains WrapperEligibility, WrapperSyncTransaction, MigrationPreparationActionability, MigrationCompletionTruth (NoFalseCompletion FAILS: grace/sync work omitted), LockedResolverAuthority, LockedResolverFreshness, LockedResolverRecordSafety, GraceRenewalBoundary. Also missed #1500.
- Lesson (REPORT): generated invariant NonMemberResolverIsPreserved mirrored the implementation, so it could not catch #1500. Invariants must be stated as end-user promises, e.g. "a locked name must not keep an uncertified non-zero resolver and lose record control once the V1 token moves to the Graveyard".
- pstack-exhaustive-migration: benchmark/regression-candidate pool.
