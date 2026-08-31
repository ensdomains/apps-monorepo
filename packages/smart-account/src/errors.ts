/**
 * Errors raised by smart-account session helpers.
 *
 * Uses the workspace tagged-error convention (`TaggedError` from
 * `@ens-apps/utils/neverthrow`), matching `transaction.errors.ts`, so these
 * flow through `ResultAsync` and XState actors with a discriminating `_tag`.
 * `message` and `cause` come from the factory's default error body.
 */

import { TaggedError } from '@ens-apps/utils/neverthrow'

/** Raised when creating/enabling a Rhinestone HCA owner-key session fails. */
export class SessionEnableError extends TaggedError('SessionEnableError')<{
  message: string
  cause?: unknown
}> {}

/**
 * Why an owner-signed on-chain session revocation could not complete.
 *
 * `not-deployed` is NOT a benign "nothing to do": no session is enabled yet,
 * but a leaked stored record still carries an authorization signed against
 * nonce 0, and deployment is permissionless — so the UI must offer to deploy
 * and revoke rather than quietly report success.
 */
export type SessionRevokeReason =
  | 'not-deployed'
  | 'not-owner'
  | 'transaction-failed'
  | 'unknown'

/** Raised when the owner-signed on-chain session revocation fails. */
export class SessionRevokeError extends TaggedError('SessionRevokeError')<{
  message: string
  reason: SessionRevokeReason
  cause?: unknown
}> {}

/** Raised when restoring a stored session fails (e.g. expired). */
export class SessionRestoreError extends TaggedError('SessionRestoreError')<{
  message: string
  cause?: unknown
}> {}

/** Raised when creating the in-memory HCA account via the SDK fails. */
export class AccountInitError extends TaggedError('AccountInitError')<{
  message: string
  cause?: unknown
}> {}

/**
 * Raised when adopting an already-deployed HCA fails verification
 * (owner / accountId / implementation mismatch). Carries the offending
 * field so the UI can show a precise recovery state and NEVER silently
 * fall back to a different HCA.
 */
export class AccountVerificationError extends TaggedError(
  'AccountVerificationError',
)<{
  message: string
  field: 'owner' | 'authorizedOwner' | 'accountId' | 'implementation'
  expected: string
  actual: string
  cause?: unknown
}> {}
