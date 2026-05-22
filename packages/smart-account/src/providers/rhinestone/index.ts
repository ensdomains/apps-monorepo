/**
 * Rhinestone provider barrel.
 *
 * Today Rhinestone is the only smart-account provider this package
 * implements. The `providers/<provider>/` layout exists so a future
 * second provider (custom AA, our own contracts, etc.) can land next
 * to this one without having to reshuffle the package — see the PR
 * discussion on https://github.com/ensdomains/apps-monorepo/pull/751
 * for the rationale.
 *
 * Re-exports stay explicit (`initializeRhinestoneAccount`,
 * `RhinestoneStoredSession`, …) rather than going through a generic
 * `SmartAccountProvider` interface; we'll introduce that contract
 * once we actually have a second provider and know what the seam
 * needs to look like.
 */

export {
  type InitializeRhinestoneAccountParams,
  type InitProgressStage,
  initializeRhinestoneAccount,
  type RhinestoneInitConfig,
  type RhinestoneInitResult,
  type SmartAccountInfrastructure,
} from './initialize-account'
export {
  type BuildRegistrationSessionActionsParams,
  buildRegistrationSessionActions,
  REGISTRATION_SESSION_VALIDITY_SECONDS,
} from './registration-policy'
export {
  type CreateRhinestoneSessionParams,
  createRhinestoneSession,
  type RestoreRhinestoneSessionParams,
  restoreRhinestoneSession,
} from './session'
export {
  isRhinestoneSession,
  type RhinestoneStoredSession,
} from './types'
