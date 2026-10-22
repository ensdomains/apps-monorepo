import { TaggedError } from '@ens-apps/utils/neverthrow'
import type { DatabaseError } from '#core/database/index.js'

export class TelegramConfigurationError extends TaggedError(
  'TELEGRAM_CONFIGURATION_ERROR',
)<{
  readonly cause?: unknown
}> {}

export class TelegramCryptoError extends TaggedError('TELEGRAM_CRYPTO_ERROR')<{
  readonly cause: unknown
}> {}

export class TelegramAttemptThrottledError extends TaggedError(
  'TELEGRAM_ATTEMPT_THROTTLED',
) {}

export class TelegramAttemptUnavailableError extends TaggedError(
  'TELEGRAM_ATTEMPT_UNAVAILABLE',
)<{
  readonly stage: 'claim' | 'complete'
}> {}

export class TelegramAuthorizationError extends TaggedError(
  'TELEGRAM_AUTHORIZATION_ERROR',
)<{
  readonly reason:
    | 'invalid_state'
    | 'denied'
    | 'invalid_code'
    | 'missing_credentials'
}> {}

export class TelegramTokenExchangeError extends TaggedError(
  'TELEGRAM_TOKEN_EXCHANGE_ERROR',
)<{
  readonly stage: 'credentials' | 'request' | 'provider' | 'decode' | 'response'
  readonly status?: number
  readonly cause?: unknown
}> {
  override get message() {
    return 'Telegram token exchange failed'
  }
}

export class TelegramIdentityError extends TaggedError(
  'TELEGRAM_IDENTITY_ERROR',
)<{
  readonly stage: 'verification' | 'claims' | 'profile'
  readonly cause?: unknown
}> {}

export class TelegramMessagingError extends TaggedError(
  'TELEGRAM_MESSAGING_ERROR',
)<{
  readonly cause: unknown
  readonly errorCode?: number
}> {}

// Preserve both failures if recovery itself fails. Transport code must log only
// safe tags/stages: causes can contain SQL parameters or provider credentials.
export class TelegramAttemptRecoveryError<
  TFailure extends { readonly _tag: string },
> extends TaggedError('TELEGRAM_ATTEMPT_RECOVERY_ERROR')<{
  readonly attemptId: string
  readonly operation: 'record_failure' | 'record_delivery_refusal'
  readonly failure: TFailure
  readonly cause: DatabaseError
}> {}
