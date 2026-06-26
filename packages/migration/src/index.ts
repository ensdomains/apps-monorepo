// Public API. Internals (ABIs, multicall, granular checks, chain config) stay unexported.
export {
  type ClassifiedName,
  type ClassifyNamesResult,
  type ClassifyOptions,
  classifyName,
  classifyNames,
  FUSES,
  hasFuse,
  type IneligibleName,
  type IneligibleReason,
  type MigrationTokenType,
} from './classify'
export {
  type EvaluateMigrationOptions,
  evaluateMigration,
  type MigrationBlockReason,
  type MigrationVerdict,
  tokenHolderOf,
} from './evaluate'
export {
  type EligibilityResult,
  type PreflightAddresses,
  runEligibilityChecks,
} from './preflight'
export type { V1Domain } from './types'
