/**
 * @ens-apps/smart-account
 *
 * Shared smart-account helpers for ENS apps. Today this is a Rhinestone-only
 * implementation: it owns the smart-session enablement flow and the
 * registration-scoped action set. Session storage and SDK account
 * initialization currently live in the consuming app because they couple to
 * app-specific concerns (wagmi chain config, toaster, env vars); moving those
 * in is tracked as a follow-up.
 *
 * The package is named `smart-account` rather than after the vendor so we
 * don't have to rename it if the implementation backend changes (Rhinestone,
 * ZeroDev, Biconomy, etc. — all interchangeable behind the same surface).
 */

export {
  type BuildRegistrationSessionActionsParams,
  buildRegistrationSessionActions,
  REGISTRATION_SESSION_VALIDITY_SECONDS,
} from './build-registration-session'
export { SessionError } from './errors'
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
