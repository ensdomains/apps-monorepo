/**
 * Errors raised by smart-account session helpers.
 *
 * Uses the workspace tagged-error convention (`TaggedError` from
 * `@ens-apps/utils/neverthrow`), matching `transaction.errors.ts`, so these
 * flow through `ResultAsync` and XState actors with a discriminating `_tag`.
 * `message` and `cause` come from the factory's default error body.
 */

import { TaggedError } from '@ens-apps/utils/neverthrow'

/** Raised when creating/enabling a Rhinestone smart session fails. */
export class SessionEnableError extends TaggedError('SessionEnableError')<{
  message: string
  cause?: unknown
}> {}

/** Raised when restoring a stored session fails (e.g. expired). */
export class SessionRestoreError extends TaggedError('SessionRestoreError')<{
  message: string
  cause?: unknown
}> {}
