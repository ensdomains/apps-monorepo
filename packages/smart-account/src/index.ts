/**
 * @ens-apps/smart-account
 *
 * Shared smart-account helpers for ENS apps. Today this is a
 * Rhinestone-only implementation covering HCA (Hidden Contract Account)
 * initialization (`initializeRhinestoneAccount`) and the smart-session
 * lifecycle (`createRhinestoneSession`, session storage, the scoped
 * registration policy).
 *
 * The HCA model (`@rhinestone/sdk`) installs an ENS ownership validator at
 * construction and permanently locks its module set. Smart sessions are
 * therefore reached not via an installed module but via the HCA's
 * preinstalled SmartSessionEmissary: the owner signs ENABLE once, then an
 * ephemeral session key authorizes subsequent relayer-sponsored Intents
 * without re-prompting.
 *
 * App-specific concerns (Para wallet wrapping, wagmi chain config,
 * toaster, i18n, env vars) stay in the consuming app. Initialization
 * takes injected dependencies via `InitializeRhinestoneAccountParams`.
 *
 * The package is named `smart-account` rather than after the vendor so
 * we don't have to rename it if the implementation backend changes.
 * Provider-specific code lives under `providers/<provider>/`; this root
 * barrel re-exports the current provider's surface so consumers can stay
 * on a single import path until we actually need multiple providers.
 */

// Current provider (Rhinestone). Explicit, vendor-named re-exports —
// we'll introduce a generic provider contract once a second provider
// exists and proves what the abstraction needs to look like.
export { SessionEnableError, SessionRestoreError } from './errors'
export {
  buildAddSessionOwnerCall,
  type CreateRhinestoneSessionParams,
  clearAllSessions,
  createRhinestoneSession,
  deployRhinestoneAccountCore,
  ENS_HCA_MODULE,
  getAllSessions,
  getSession,
  getSessionByOwner,
  getSkippedStatus,
  getValidSession,
  getValidSessionByOwner,
  getValidSessionForAccount,
  type InitializeRhinestoneAccountParams,
  type InitProgressStage,
  initializeRhinestoneAccount,
  initializeRhinestoneAccountCore,
  isRhinestoneSession,
  isSessionExpired,
  REGISTRATION_SESSION_VALIDITY_SECONDS,
  type RestoreRhinestoneSessionParams,
  type RhinestoneInitConfig,
  type RhinestoneInitResult,
  type RhinestoneStoredSession,
  removeSession,
  removeSessionsByOwner,
  restoreRhinestoneSession,
  type SessionScope,
  saveSession,
  setSkippedStatus,
} from './providers/rhinestone'
export type { BaseStoredSession } from './types'
