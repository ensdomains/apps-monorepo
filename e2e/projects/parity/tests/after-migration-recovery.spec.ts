import { registerAfterMigrationChecks } from '../helpers/after-migration.js'

// Fresh fixture per check; never replay a transaction from a previous run.
registerAfterMigrationChecks(
  ['send', 'edit', 'roles', 'sync', 'dates'],
  [10],
  true,
)
