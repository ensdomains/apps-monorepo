// Public API: the cross-app v1→v2 migration surface. Internal plumbing
// (ABIs, multicall, the granular preflight checks, chain config) stays
// unexported — consumers go through `evaluateMigration` / `classifyName` /
// `runEligibilityChecks`.
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
