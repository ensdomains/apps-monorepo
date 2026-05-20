/**
 * @ens-apps/smart-account
 *
 * Shared smart-account helpers for ENS apps. Today this is a
 * Rhinestone-only implementation covering:
 *
 *   - SDK account initialization (`initializeRhinestoneAccount`)
 *   - Smart-session lifecycle (`createRhinestoneSession`,
 *     `restoreRhinestoneSession`)
 *   - The registration/renewal-scoped session policy
 *     (`buildRegistrationSessionActions`)
 *   - Persisted session shape (`RhinestoneStoredSession`)
 *
 * App-specific concerns (Para wallet wrapping, wagmi chain config,
 * toaster, i18n, env vars, session storage location) stay in the
 * consuming app. Initialization takes injected dependencies via
 * `InitializeRhinestoneAccountParams`.
 *
 * The package is named `smart-account` rather than after the vendor so
 * we don't have to rename it if the implementation backend changes
 * (Rhinestone, ZeroDev, Biconomy, etc. — all interchangeable behind
 * the same surface).
 */

export {
  type BuildRegistrationSessionActionsParams,
  buildRegistrationSessionActions,
  REGISTRATION_SESSION_VALIDITY_SECONDS,
} from './build-registration-session'
export { SessionError } from './errors'
export {
  type InitializeRhinestoneAccountParams,
  type InitProgressStage,
  initializeRhinestoneAccount,
  type RhinestoneInitConfig,
  type RhinestoneInitResult,
  type SmartAccountInfrastructure,
} from './initialize-account'
export {
  type CreateRhinestoneSessionParams,
  createRhinestoneSession,
  type RestoreRhinestoneSessionParams,
  restoreRhinestoneSession,
} from './rhinestone-session'
export {
  type BaseStoredSession,
  isRhinestoneSession,
  type RhinestoneStoredSession,
} from './types'
