import { TaggedError } from '@ens-apps/utils/neverthrow'
import type { DatabaseError } from '#core/database/index.js'

export class TelegramConfigurationError extends TaggedError(
  'TELEGRAM_CONFIGURATION_ERROR',
)<{
  cause?: unknown
}> {}

export class TelegramCryptoError extends TaggedError('TELEGRAM_CRYPTO_ERROR')<{
  cause: unknown
}> {}

export class TelegramAttemptThrottledError extends TaggedError(
  'TELEGRAM_ATTEMPT_THROTTLED',
) {}

export class TelegramAttemptUnavailableError extends TaggedError(
  'TELEGRAM_ATTEMPT_UNAVAILABLE',
)<{
  stage: 'claim' | 'complete'
}> {}

export class TelegramAuthorizationError extends TaggedError(
  'TELEGRAM_AUTHORIZATION_ERROR',
)<{
  reason: 'invalid_state' | 'denied' | 'invalid_code' | 'missing_credentials'
}> {}

export class TelegramTokenExchangeError extends TaggedError(
  'TELEGRAM_TOKEN_EXCHANGE_ERROR',
)<{
  stage: 'credentials' | 'request' | 'provider' | 'decode' | 'response'
  status?: number
  cause?: unknown
}> {
  override get message() {
    return 'Telegram token exchange failed'
  }
}

export class TelegramIdentityError extends TaggedError(
  'TELEGRAM_IDENTITY_ERROR',
)<{
  stage: 'verification' | 'claims' | 'profile'
  cause?: unknown
}> {}

export class TelegramMessagingError extends TaggedError(
  'TELEGRAM_MESSAGING_ERROR',
)<{
  cause: unknown
  errorCode?: number
}> {}

// Preserve both failures if recovery itself fails. Transport code must log only
// safe tags/stages: causes can contain SQL parameters or provider credentials.
export class TelegramAttemptRecoveryError<
  TFailure extends { readonly _tag: string },
> extends TaggedError('TELEGRAM_ATTEMPT_RECOVERY_ERROR')<{
  attemptId: string
  operation: 'record_failure' | 'record_delivery_refusal'
  failure: TFailure
  cause: DatabaseError
}> {}
