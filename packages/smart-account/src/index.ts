/**
 * @ens-apps/smart-account
 *
 * Shared smart-account helpers for ENS apps. Today this is a
 * Rhinestone-only implementation covering HCA (Hidden Contract Account)
 * initialization (`initializeRhinestoneAccount`).
 *
 * The HCA model (`@rhinestone/sdk@1.7.0`) installs an ENS ownership
 * validator at construction and permanently locks its module set, so
 * there is no smart-session lifecycle: every ENS operation is an
 * owner-signed, relayer-sponsored Intent (gas sponsored via Rhinestone
 * Warp).
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
export {
  type InitializeRhinestoneAccountParams,
  type InitProgressStage,
  initializeRhinestoneAccount,
  type RhinestoneInitConfig,
  type RhinestoneInitResult,
} from './providers/rhinestone'
