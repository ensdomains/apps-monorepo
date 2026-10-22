import { errors } from 'jose'
import * as v from 'valibot'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { intoDbError } from '#core/database/index.js'
import { logger } from '#utils/logger.js'
import {
  TelegramAttemptRecoveryError,
  TelegramIdentityError,
  TelegramTokenExchangeError,
} from './errors.js'
import { logTelegramLoginFailure } from './logging.js'

afterEach(() => vi.restoreAllMocks())

describe('Telegram login logging', () => {
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
