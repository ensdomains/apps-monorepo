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
 * The HCA account model is session-less: the ENS ownership validator
 * authorizes every Intent, so there is no smart-session lifecycle to
 * export here (see `initialize-account.ts`).
 */

export {
  type InitializeRhinestoneAccountParams,
  type InitProgressStage,
  initializeRhinestoneAccount,
  type RhinestoneInitConfig,
  type RhinestoneInitResult,
} from './initialize-account'
