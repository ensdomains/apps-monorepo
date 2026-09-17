import type { MigrationJournalOperation } from './migrationBatchJournal'

const nameCount = (count: number): string =>
  `${count} ${count === 1 ? 'name' : 'names'}`

export const describeUpgradeOperations = (
  operations: readonly MigrationJournalOperation[],
): string => {
  const single = operations.length === 1 ? operations[0] : undefined
  if (single) {
    return `${single.action === 'copy' ? 'Copying' : 'Upgrading'} ${single.name}`
  }

  const migrated = operations.filter(
    ({ action }) => action === 'migrate',
  ).length
  const copied = operations.length - migrated
  if (migrated === 0) return `Copying ${nameCount(copied)}`
  if (copied === 0) return `Upgrading ${nameCount(migrated)}`
  return `Upgrading ${nameCount(migrated)}, copying ${copied}`
}

export const describeRecoveredOperations = (
  names: readonly string[],
  operations: readonly MigrationJournalOperation[],
): string => {
  if (names.length === 1) {
    const operation = operations.find(({ name }) => name === names[0])
    if (!operation) return `${names[0]} was already done`
    return `${names[0]} was already ${operation.action === 'copy' ? 'copied' : 'upgraded'}`
  }

  const migrated = operations.filter(
    ({ action }) => action === 'migrate',
  ).length
  const copied = operations.length - migrated
  if (migrated === 0) return `${nameCount(copied)} were already copied`
  if (copied === 0) return `${nameCount(migrated)} were already upgraded`
  return `${migrated} already upgraded, ${copied} already copied`
}
