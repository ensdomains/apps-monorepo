// Migration preflight lives in @ens-apps/migration (shared with the portal
// explorer). The granular checks (checkOwnership / checkFrozenApproval) are
// package-internal and tested there; manager only needs the composed entry.
export {
  type EligibilityResult,
  runEligibilityChecks,
} from '@ens-apps/migration'
