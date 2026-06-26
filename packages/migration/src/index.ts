// Public API. Internals (ABIs, multicall, granular checks, chain config) stay unexported.
export {
  type ClassifiedName,
  type ClassifyNamesResult,
  classifyName,
  classifyNames,
  FUSES,
  hasFuse,
  type IneligibleName,
  type IneligibleReason,
  type MigrationTokenType,
} from './service/classifyNames'
export {
  evaluateMigration,
  type MigrationBlockReason,
  type MigrationVerdict,
} from './service/evaluateMigration'
export {
  type EligibilityResult,
  runEligibilityChecks,
} from './service/preflightChecks'
export type { V1Domain } from './service/v1SubgraphClient'
