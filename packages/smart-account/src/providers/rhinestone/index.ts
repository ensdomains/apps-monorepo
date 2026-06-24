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
 * The HCA reaches smart sessions through its preinstalled
 * SmartSessionEmissary (not an installed module — the HCA's module set is
 * locked). The session lifecycle is exported here: `registration-policy`
 * (the scoped action set), `session` (create/restore + the one-time enable
 * signature), and `session-storage` (localStorage persistence of the
 * ephemeral key).
 */

export {
  deployRhinestoneAccountCore,
  type InitializeRhinestoneAccountParams,
  type InitProgressStage,
  initializeRhinestoneAccount,
  initializeRhinestoneAccountCore,
  type RhinestoneInitConfig,
  type RhinestoneInitResult,
} from './initialize-account'
export {
  buildAddSessionOwnerCall,
  ENS_HCA_MODULE,
  REGISTRATION_SESSION_VALIDITY_SECONDS,
} from './registration-policy'
export {
  type CreateRhinestoneSessionParams,
  createRhinestoneSession,
  type RestoreRhinestoneSessionParams,
  restoreRhinestoneSession,
} from './session'
export {
  clearAllSessions,
  getAllSessions,
  getSession,
  getSessionByOwner,
  getSkippedStatus,
  getValidSession,
  getValidSessionByOwner,
  getValidSessionForAccount,
  isSessionExpired,
  removeSession,
  removeSessionsByOwner,
  type SessionScope,
  saveSession,
  setSkippedStatus,
} from './session-storage'
export { isRhinestoneSession, type RhinestoneStoredSession } from './types'
