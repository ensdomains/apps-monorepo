/**
 * @ens-apps/smart-account
 *
 * Shared smart-account helpers for ENS apps. Today this is a
 * Rhinestone-only implementation covering HCA (Hidden Contract Account)
 * initialization (`initializeRhinestoneAccount`) and the prompt-free
 * registration session lifecycle (`createRhinestoneSession`, session storage,
 * the add-owner registration policy).
 *
 * The HCA model (`@rhinestone/sdk`) installs an ENS ownership validator
 * (HCAModule, an OwnableValidator) at construction and permanently locks its
 * module set. It does NOT use ERC-7579 SmartSessions/Emissary (those modules
 * are not installed; verified on-chain). Prompt-free registration is instead
 * achieved by adding an ephemeral key as a time-boxed OWNER of the
 * OwnableValidator: the owner signs ENABLE once (the add-owner Intent), then
 * the ephemeral key authorizes subsequent relayer-sponsored Intents without
 * re-prompting until it expires. See
 * apps/manager/src/lib/smart-account/HCA_SESSION.md.
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
