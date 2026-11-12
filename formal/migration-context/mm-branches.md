# Local fix/mm-0xx branches (Mac mini, ~/projects/ensdomains/apps-monorepo-formal-verification)

Read with git log/diff only. Raw diffs: /workspace/fv-migration/raw/fv-research/mm/*.txt
Most branches sit on test-campaign commit f8eeef174 (394 commits off origin/main); diffs below are vs f8eeef174
(mm-003 vs 740bcf504, mm-004 vs f953ac138, mm-039 vs 891855260, mm-045 vs 50fc8f0e1).
"On main?" = checked against origin/main 6977db2d7 by grepping for the fix's symbol.

| Branch | Commits | What it changes | On main? |
|---|---|---|---|
| fix/mm-001-duplicate-same-scope-execution | ddcd52dbe | New migrationExecutionLock.ts: Web Locks `ifAvailable` exclusive lock keyed chain:owner:hca (in-process Set fallback); executeMigration wrapped. Tests: only one same-scope run reaches startTransaction; other scopes independent; released after success/failure. | No (no navigator.locks in migration service on main; PR #1588 closed unmerged) |
| fix/mm-002-retry-rehydration-drops-batches | 3fa4f10ee | adjustPlanForRetry keeps batch executions by name+action instead of object identity (`remainingClassified.includes`). | No (buildMigrationPlan.ts:1268 still uses includes) |
| fix/mm-003-direct-only-recovery-gap | 957244f68, 2e9ddec29 | Persist recovery snapshot for direct-only plans too; new persistPendingAtomicMigrationAttempt writes intent+snapshot in one journal write before submission; clear recovery journal on completion for all plans. | Yes (#1526 ac22f4e78) |
| backup/mm-003-pre-main-rebase | c4e466b5b, d84a52321 | Same as above, pre-rebase. | - |
| fix/mm-004-exact-retained-manager-roles | 6d10d1c01 | manager-role expectation verified with `roles(resource, account) == bitmap`, not `hasRoles` subset. | Yes (#1529 740bcf504; verifyAtomicMigrationBatch.ts:524) |
| backup/mm-004-before-main-cleanup | 56c2c4323, 5b92f6284 | Same + test drift repair. | - |
| fix/mm-007-partial-failure-stale-queries | cabc4fd7a | MigrationPage: on failure with completedOperations>0, record recently-migrated names and invalidate migration queries; retry-blocked copy says "Some upgrades were already completed". | No (MigrationPage.tsx:441 only on success) |
| fix/mm-009-excess-owner-roles-accepted | 924a98977, a82ba1ec8 | name-owner-roles and wrapper-root-roles verified exactly via roles(); owner bitmap includes ROLE_WAS_RESERVED (1<<32) for locked-2ld. | No (hasRoles at verifyAtomicMigrationBatch.ts:369,412) |
| fix/mm-010-excess-wrapper-root-roles-accepted | b58241da5 | wrapper-root-roles exact via roles(). | No |
| fix/mm-019-cross-tab-journal-lost-update | 20df1b7eb..04e6f7163 (10 commits, several no-mistakes review commits) | Journal writes become async mutateJournal under exclusive Web Lock with raw-string compare-and-swap (MigrationBatchJournalConflictError); expectedRecovery fingerprint checks; per-scope execution lock; completion cleanup removes only verified intent ids / hashes and refuses if an unresolved foreign attempt overlaps; requires Web Locks + durable storage (release notes). | No |
| fix/mm-024-stale-effect-deletes-new-recovery | 181672ded, baf2c0f0c | useMigrationRecoverySnapshot discards a snapshot only via removeUnusedMigrationRecoverySnapshot(scope, expectedSnapshot) which no-ops if intents/submissions exist or snapshot changed. | No (main still discards by scope) |
| fix/mm-032-uncertified-parent-registry-verification | 0d989026e | Registry paths carry expectedRegistries per traversal step (user registry or computed WrapperRegistry); verification rejects unbound paths and any getSubregistry != expected; manager-role uses same bound path. | No |
| fix/mm-039-pending-transaction-resubmission | 6b950b8ee | getSubmittedBatchReceipt returns found/absent; if receipt missing, getTransaction: only TransactionNotFoundError = absent (allows state fallback); any other failure = indeterminate, hash stays locked; "without inventing a product timeout". | No |
| fix/mm-045-offchain-bundle-failure-misclassified | (none) | Branch has 0 commits beyond 50fc8f0e1 - no fix written. | - |
| fix/manager-migration-teardown (=MM-013) | 9d00816e7, b37d64aca | Gate migration wallet submissions after teardown (submissionGate). | Yes (#1520 13eabac62) |

Not found as branches: mm-005, 006, 008, 011-018, 020-023, 025-031, 033-038, 040-044 (and 046-050).
Remote no-mistakes/* has copies of 001, 004 (as excess-manager-roles-accepted), 009, 019, 039.
