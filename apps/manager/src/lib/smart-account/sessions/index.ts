// Re-export rhinestone session helpers from the shared package so existing
// call sites that import from `./sessions` keep working.
export {
  type BuildRegistrationSessionActionsParams,
  buildRegistrationSessionActions,
  type CreateRhinestoneSessionParams,
  createRhinestoneSession,
  REGISTRATION_SESSION_VALIDITY_SECONDS,
  type RestoreRhinestoneSessionParams,
  restoreRhinestoneSession,
  SessionError,
} from '@ens-apps/smart-account'
export * from './types'
