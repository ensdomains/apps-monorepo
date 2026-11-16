export { BASE_REGISTRAR_ABI, NAME_WRAPPER_ABI } from './contracts/abis'
export {
  isAddressOnlyResolver,
  isKnownPublicResolver,
  isLegacyContentPublicResolver,
  isSupportedRecordResolver,
} from './contracts/knownResolvers'
export {
  type ClassifiedName,
  type ClassifyNamesResult,
  type CopyClassifiedName,
  type CopySource,
  type CopyTokenType,
  classifyName,
  classifyNames,
  type DirectClassifiedName,
  FUSES,
  hasFuse,
  type IneligibleName,
  type IneligibleReason,
  type MigrationTokenType,
  managerRestorationCandidates,
  type ResolverStrategy,
  registryControllerOf,
  withManagerRestorationOptIn,
  wrappedCopyExpiry,
} from './service/classifyNames'
export {
  type EligibilityResult,
  holdsSyncableWrapper,
  runEligibilityChecks,
} from './service/preflightChecks'
export {
  RegistryRepairReadError,
  readRegistryRepairState,
} from './service/readRegistryRepairState'
export {
  compareRegistryRepair,
  planRegistryRepair,
  type RegistryRepairCall,
  type RegistryRepairDifference,
  type RegistryRepairName,
  type RegistryRepairPlan,
  RegistryRepairPlanError,
  type RegistryRepairState,
  type RoleGrant,
} from './service/registryRepair'
export {
  getSubnameMigrationImpact,
  MAX_UNRECOVERABLE_SUBNAMES,
  readSubnameMigrationImpact,
  type SubnameMigrationImpact,
  SubnameMigrationImpactError,
  unknownLabelhashOf,
} from './service/subnameMigrationImpact'
export { canSkipEmptySubtree } from './service/subnameMigrationImpact.helpers'
export type { V1Domain } from './service/v1Domain'
export {
  needsParentFuses,
  parentNameOf,
  toParentFuses,
  toV1Domain,
} from './service/v1Domain'
