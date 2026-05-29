/**
 * Rhinestone provider barrel.
 *
 * Today Rhinestone is the only smart-account provider this package
 * implements. The `providers/<provider>/` layout exists so a future
 * second provider (custom AA, our own contracts, etc.) can land next
 * to this one without having to reshuffle the package.
 *
 * Two consumption shapes are exposed:
 *
 *   1. Direct, vendor-named exports — `initializeRhinestoneAccount`,
 *      `createRhinestoneSession`, `RhinestoneStoredSession`, etc. The
 *      manager uses these today.
 *   2. The generic `SmartAccountProvider` contract — call
 *      `rhinestoneProvider()` to get an object that implements it.
 *      The contract exists so a future caller can hold a
 *      `SmartAccountProvider<…>` without naming Rhinestone explicitly.
 *
 * Both shapes resolve to the same underlying functions; the contract
 * just rebinds them to method names. Nothing here is duplicated.
 */

import type { SmartAccountProvider } from '../../types'
import {
  type InitializeRhinestoneAccountParams,
  initializeRhinestoneAccount,
  type RhinestoneInitResult,
} from './initialize-account'
import {
  type CreateRhinestoneSessionParams,
  createRhinestoneSession,
  type RestoreRhinestoneSessionParams,
  restoreRhinestoneSession,
} from './session'
import { isRhinestoneSession, type RhinestoneStoredSession } from './types'

export {
  type BootstrapHCAParams,
  bootstrapHCA,
  encodeHCAInitData,
  HCABootstrapError,
  type HCABootstrapResult,
} from './bootstrap'
export {
  type InitializeRhinestoneAccountParams,
  type InitProgressStage,
  initializeRhinestoneAccount,
  type RhinestoneInitConfig,
  type RhinestoneInitResult,
  type SmartAccountInfrastructure,
} from './initialize-account'
export {
  type BuildRegistrationSessionActionsParams,
  buildRegistrationSessionActions,
  buildRegistrationSessionActionsHash,
  REGISTRATION_SESSION_VALIDITY_SECONDS,
} from './registration-policy'
export {
  type CreateRhinestoneSessionParams,
  createRhinestoneSession,
  type RestoreRhinestoneSessionParams,
  restoreRhinestoneSession,
} from './session'
export {
  isRhinestoneSession,
  type RhinestoneStoredSession,
} from './types'

/**
 * Concrete `SmartAccountProvider` for Rhinestone.
 *
 * Returns a fresh object each call; the underlying functions are pure
 * (or close enough — `RhinestoneSDK` constructor happens inside
 * `initializeRhinestoneAccount`, not here) so there's no shared state
 * to cache.
 */
export function rhinestoneProvider(): SmartAccountProvider<
  InitializeRhinestoneAccountParams,
  RhinestoneInitResult,
  CreateRhinestoneSessionParams,
  RhinestoneStoredSession,
  RestoreRhinestoneSessionParams
> {
  return {
    name: 'rhinestone',
    initialize: initializeRhinestoneAccount,
    createSession: createRhinestoneSession,
    restoreSession: restoreRhinestoneSession,
    isSession: isRhinestoneSession,
  }
}
