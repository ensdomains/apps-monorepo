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
 * the same surface). Provider-specific code lives under
 * `providers/<provider>/`; this root barrel re-exports the current
 * provider's surface so consumers can stay on a single import path
 * until we actually need to expose multiple providers.
 */

// Shared / cross-provider surface.
export { SessionError } from './errors'
// Current provider (Rhinestone). Vendor-named re-exports stay for
// callers (notably the manager) that talk to Rhinestone directly.
// `rhinestoneProvider()` plus the generic `SmartAccountProvider`
// contract are also exported for callers that want to stay
// vendor-agnostic.
export {
  type BootstrapHCAParams,
  type BuildRegistrationSessionActionsParams,
  bootstrapHCA,
  buildRegistrationSessionActions,
  buildRegistrationSessionActionsHash,
  type CreateRhinestoneSessionParams,
  createRhinestoneSession,
  encodeHCAInitData,
  HCABootstrapError,
  type HCABootstrapResult,
  type InitializeRhinestoneAccountParams,
  type InitProgressStage,
  initializeRhinestoneAccount,
  isRhinestoneSession,
  REGISTRATION_SESSION_VALIDITY_SECONDS,
  type RestoreRhinestoneSessionParams,
  type RhinestoneInitConfig,
  type RhinestoneInitResult,
  type RhinestoneStoredSession,
  restoreRhinestoneSession,
  rhinestoneProvider,
  type SmartAccountInfrastructure,
} from './providers/rhinestone'
export type {
  BaseStoredSession,
  SmartAccountProvider,
} from './types'
