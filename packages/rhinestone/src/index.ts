/**
 * @ens-apps/rhinestone
 *
 * Rhinestone-specific helpers shared across ENS apps. Owns the smart-session
 * enablement flow and the registration-scoped action set; session storage and
 * SDK initialization stay in the consuming app because they couple to
 * app-specific concerns (wagmi chain config, toaster, env vars).
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
