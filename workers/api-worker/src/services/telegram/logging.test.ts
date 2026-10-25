import { errors } from 'jose'
import * as v from 'valibot'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { intoDbError } from '#core/database/index.js'
import { logger } from '#utils/logger.js'
import { createIntoError } from '#utils/result.js'
import {
  TelegramAttemptRecoveryError,
  TelegramIdentityError,
  TelegramMessagingError,
  TelegramTokenExchangeError,
} from './errors.js'
import { logTelegramLoginFailure } from './logging.js'

afterEach(() => vi.restoreAllMocks())

describe('Telegram login logging', () => {
  it('preserves wrapped fetch failures without leaking URLs or request data', () => {
    const secret = 'bot-secret private-code private-chat-id'
    const networkError = Object.assign(new Error(secret), { code: 'ENOTFOUND' })
    const cause = createIntoError('TELEGRAM_API_REQUEST_ERROR')(
      new TypeError(secret, { cause: networkError }),
    )
    const log = vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
    logTelegramLoginFailure(
      'callback',
      new TelegramMessagingError({
        cause: { ...cause, method: 'sendMessage', stage: 'request' },
      }),
    )
    expect(log).toHaveBeenCalledWith(
      'Telegram login unsuccessful',
      expect.objectContaining({
        cause: expect.objectContaining({
          stage: 'request',
          method: 'sendMessage',
          error: expect.objectContaining({
            errorName: 'TypeError',
            cause: expect.objectContaining({ errorCode: 'ENOTFOUND' }),
          }),
        }),
      }),
    )
    for (const value of secret.split(' '))
      expect(JSON.stringify(log.mock.calls)).not.toContain(value)
  })

  it('identifies request timeouts in the shared error wrapper', () => {
    const log = vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
    logTelegramLoginFailure(
      'callback',
      new TelegramMessagingError({
        cause: createIntoError('TELEGRAM_API_REQUEST_ERROR')(
          new DOMException('private request URL', 'TimeoutError'),
        ),
      }),
    )
    expect(log).toHaveBeenCalledWith(
      'Telegram login unsuccessful',
      expect.objectContaining({
        cause: expect.objectContaining({
          error: expect.objectContaining({ errorName: 'TimeoutError' }),
        }),
      }),
    )
    expect(JSON.stringify(log.mock.calls)).not.toContain('private request URL')
  })

  it.each([
    [403, 'Forbidden: bot was blocked by the user', 'bot_blocked_by_user'],
    [403, 'Forbidden: user is deactivated', 'user_deactivated'],
    [
      403,
      "Forbidden: bot can't initiate conversation with a user",
      'bot_cannot_initiate_conversation',
    ],
    [400, 'Bad Request: chat not found', 'chat_not_found'],
    [
      400,
      "Bad Request: can't parse entities at byte offset 42",
      'invalid_message_format',
    ],
    [401, 'Unauthorized', 'invalid_bot_credentials'],
    [429, 'Too Many Requests: retry after 30', 'rate_limited'],
    [500, 'private unknown response', 'unrecognized_provider_error'],
  ])(
    'explains Telegram refusal %s: %s',
    (errorCode, message, telegramReason) => {
      const log = vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
      logTelegramLoginFailure(
        'callback',
        new TelegramMessagingError({
          cause: {
            code: 'TELEGRAM_API_REQUEST_ERROR',
            errorCode,
            message,
            stage: 'provider',
            method: 'sendMessage',
            status: errorCode,
            parameters: { retry_after: 30, migrate_to_chat_id: 123456789 },
          },
        }),
      )
      expect(log).toHaveBeenCalledWith(
        'Telegram login unsuccessful',
        expect.objectContaining({
          cause: expect.objectContaining({
            telegramReason,
            telegramErrorCode: errorCode,
            status: errorCode,
            stage: 'provider',
            retryAfter: 30,
          }),
        }),
      )
      expect(JSON.stringify(log.mock.calls)).not.toContain(message)
      expect(JSON.stringify(log.mock.calls)).not.toContain('123456789')
    },
  )

  it.each([false, true])(
    'redacts sensitive causes, including recovery failures: %s',
    (hasRecoveryFailure) => {
      const secret =
        'private-code private-id-token private-verifier client-secret bot-secret'
      const failure = new TelegramTokenExchangeError({
        stage: 'request',
        cause: new Error(secret),
      })
      const error = hasRecoveryFailure
        ? new TelegramAttemptRecoveryError({
            attemptId: 'attempt-id',
            operation: 'record_failure',
            failure,
            cause: intoDbError(new Error(secret)),
          })
        : failure
      const log = vi
        .spyOn(logger, hasRecoveryFailure ? 'error' : 'warn')
        .mockImplementation(() => undefined)
      logTelegramLoginFailure('callback', error)
      expect(log).toHaveBeenCalledWith(
        hasRecoveryFailure
          ? 'Telegram login failed'
          : 'Telegram login unsuccessful',
        expect.objectContaining({
          operation: 'callback',
          errorTag: hasRecoveryFailure
            ? 'TELEGRAM_ATTEMPT_RECOVERY_ERROR'
            : 'TELEGRAM_TOKEN_EXCHANGE_ERROR',
          ...(hasRecoveryFailure
            ? { failureTag: 'TELEGRAM_TOKEN_EXCHANGE_ERROR' }
            : { stage: 'request' }),
        }),
      )
      for (const value of secret.split(' '))
        expect(JSON.stringify(log.mock.calls)).not.toContain(value)
    },
  )

  it('logs failed claims without JWT payloads', () => {
    const secret = 'private-id-token'
    const failure = new TelegramIdentityError({
      stage: 'verification',
      cause: new errors.JWTClaimValidationFailed(
        'unexpected issuer',
        { iss: secret, nonce: secret },
        'iss',
        'check_failed',
      ),
    })
    const log = vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
    logTelegramLoginFailure('callback', failure)
    expect(log).toHaveBeenCalledWith(
      'Telegram login unsuccessful',
      expect.objectContaining({
        stage: 'verification',
        cause: expect.objectContaining({
          errorCode: 'ERR_JWT_CLAIM_VALIDATION_FAILED',
          claim: 'iss',
          reason: 'check_failed',
        }),
      }),
    )
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret)
  })

  it('logs validation fields and types without the rejected input', () => {
    const secret = 'private-profile-input'
    const parsed = v.safeParse(v.object({ id: v.number() }), { id: secret })
    const log = vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
    logTelegramLoginFailure(
      'callback',
      new TelegramIdentityError({ stage: 'profile', cause: parsed.issues }),
    )
    expect(log).toHaveBeenCalledWith(
      'Telegram login unsuccessful',
      expect.objectContaining({
        stage: 'profile',
        cause: {
          validationIssues: [
            expect.objectContaining({
              field: 'id',
              expected: 'number',
              receivedType: 'string',
            }),
          ],
        },
      }),
    )
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret)
  })

  it('logs database error codes without SQL or parameters', () => {
    const secret = 'private-database-parameter'
    const failure = intoDbError(
      Object.assign(new Error(secret), { code: '23505' }),
    )
    const log = vi.spyOn(logger, 'error').mockImplementation(() => undefined)
    logTelegramLoginFailure('callback', failure)
    expect(log).toHaveBeenCalledWith(
      'Telegram login failed',
      expect.objectContaining({
        errorTag: 'DATABASE_ERROR',
        cause: expect.objectContaining({
          cause: expect.objectContaining({ errorCode: '23505' }),
        }),
      }),
    )
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret)
  })
})
