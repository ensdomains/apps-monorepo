import type { MigrationJournalOperation } from './migrationBatchJournal'
import type { MigrationResult } from './migrationService'

export const mergeCompletedMigrationOperations = (
  existing: readonly MigrationJournalOperation[],
  incoming: readonly MigrationJournalOperation[],
): MigrationJournalOperation[] => {
  const combined = [...existing, ...incoming]
  const byName = new Map(
    combined.map((operation) => [operation.name, operation]),
  )
  for (const operation of combined) {
    const previous = byName.get(operation.name)
    if (previous && previous.action !== operation.action) {
      throw new Error(
        `Migration action changed for ${operation.name}: ${operation.action} -> ${previous.action}`,
      )
    }
  }
  return [...byName.values()]
}

export const hasCompletedMigrationOutcome = (
  result: MigrationResult,
  operations: readonly MigrationJournalOperation[],
) => result.txHashes.length > 0 || operations.length > 0
