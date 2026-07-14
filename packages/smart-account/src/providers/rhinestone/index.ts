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
 * Prompt-free registration is NOT done via ERC-7579 SmartSessions/Emissary —
 * the HCA does not install those modules (its module set is locked to
 * `{HCAModule validator, IntentExecutor}`; verified on-chain). Instead, a
 * "session" is an ephemeral key added as a time-boxed OWNER of the HCA's
 * OwnableValidator, which can then sign Intents directly. The session lifecycle
 * is exported here: `registration-policy` (the `updateConfig` add-owner call
 * builder), `session` (create/restore + the one-time enable signature that adds
 * the owner), and `session-storage` (localStorage persistence of the ephemeral
 * key). See apps/manager/src/lib/smart-account/HCA_SESSION.md.
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
