import type {
  loadMigrationBatchJournal,
  MigrationJournalOperation,
  SubmittedAtomicMigrationBatch,
} from './migrationBatchJournal'

type Journal = ReturnType<typeof loadMigrationBatchJournal>

export const hasCompletedMigrationRecovery = (journal: Journal): boolean =>
  journal.pending.length === 0 &&
  journal.submitted.length === 0 &&
  journal.recovery !== null &&
  journal.recovery.remainingOperations.length === 0 &&
  journal.recovery.completedOperations.length > 0 &&
  !journal.recovery.temporaryRegistrationApproval

const sameOperations = (
  left: readonly MigrationJournalOperation[],
  right: readonly MigrationJournalOperation[],
): boolean =>
  left.length === right.length &&
  left.every((operation) =>
    right.some(
      ({ name, action }) =>
        name === operation.name && action === operation.action,
    ),
  )

export const settleMigrationRecoveryProgress = ({
  journal,
  confirmed,
}: {
  readonly journal: Journal
  readonly confirmed: SubmittedAtomicMigrationBatch
}):
  | { readonly status: 'unchanged' }
  | { readonly status: 'settled'; readonly journal: Journal } => {
  const isConfirmedAttempt = (
    intentId: string,
    operations: readonly MigrationJournalOperation[],
  ) =>
    intentId === confirmed.intentId &&
    sameOperations(operations, confirmed.operations)
  if (
    !journal.pending.some(({ id, operations }) =>
      isConfirmedAttempt(id, operations),
    ) &&
    !journal.submitted.some(
      ({ intentId, operations, hash }) =>
        hash.toLowerCase() === confirmed.hash.toLowerCase() &&
        isConfirmedAttempt(intentId, operations),
    )
  )
    return { status: 'unchanged' }

  const pending = journal.pending.filter(
    ({ id, operations }) => !isConfirmedAttempt(id, operations),
  )
  const submitted = journal.submitted.filter(
    ({ intentId, operations }) => !isConfirmedAttempt(intentId, operations),
  )
  const completed = (operation: MigrationJournalOperation) =>
    confirmed.operations.some(
      ({ name, action }) =>
        name === operation.name && action === operation.action,
    )
  const recovery = journal.recovery
    ? {
        ...journal.recovery,
        remainingOperations: journal.recovery.remainingOperations.filter(
          (operation) => !completed(operation),
        ),
        completedOperations: [
          ...journal.recovery.completedOperations,
          ...journal.recovery.remainingOperations.filter(completed),
        ],
      }
    : null
  const shouldRetainRecovery =
    recovery &&
    (recovery.remainingOperations.length > 0 ||
      recovery.temporaryRegistrationApproval ||
      pending.length > 0 ||
      submitted.length > 0)
  return {
    status: 'settled',
    journal: {
      pending,
      submitted,
      recovery: shouldRetainRecovery ? recovery : null,
    },
  }
}
