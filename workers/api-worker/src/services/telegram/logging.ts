import type { GenericIssue } from 'valibot'
import { logger } from '#utils/logger.js'

// Use fixed explanations rather than logging arbitrary provider descriptions,
// which may echo message content or identifiers.
const getTelegramReason = (error: Record<string, unknown>) => {
  if (
    error.code !== 'TELEGRAM_API_REQUEST_ERROR' ||
    typeof error.errorCode !== 'number'
  )
    return undefined
  const description = typeof error.message === 'string' ? error.message : ''
  if (/bot was blocked by the user/i.test(description))
    return 'bot_blocked_by_user'
  if (/user is deactivated/i.test(description)) return 'user_deactivated'
  if (/bot can.t initiate conversation with a user/i.test(description))
    return 'bot_cannot_initiate_conversation'
  if (/chat not found/i.test(description)) return 'chat_not_found'
  if (/can.t parse entities/i.test(description)) return 'invalid_message_format'
  if (error.errorCode === 401) return 'invalid_bot_credentials'
  if (error.errorCode === 429) return 'rate_limited'
  return 'unrecognized_provider_error'
}

const getRetryAfter = (parameters: unknown): number | undefined => {
  if (!parameters || typeof parameters !== 'object') return undefined
  if ('retry_after' in parameters && typeof parameters.retry_after === 'number')
    return parameters.retry_after
  return undefined
}

const getValidationIssues = (issues: readonly unknown[]) =>
  issues.slice(0, 10).map((value: unknown) => {
    if (!value || typeof value !== 'object') return undefined
    const issue = value as Partial<GenericIssue>
    return {
      field: Array.isArray(issue.path)
        ? issue.path.map((item) => String(item.key)).join('.')
        : undefined,
      type: issue.type,
      expected: issue.expected,
      receivedType: issue.input === null ? 'null' : typeof issue.input,
    }
  })

const getErrorCode = (code: unknown): string | undefined => {
  if (typeof code !== 'string') return undefined
  return /^(?:(?:UND_)?ERR_[A-Z0-9_]+|TELEGRAM_[A-Z0-9_]+|[0-9A-Z]{5}|ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH)$/.test(
    code,
  )
    ? code
    : undefined
}

// Preserve the causal chain without serializing JWT payloads, SQL parameters,
// validation inputs, or arbitrary error messages (which can contain credentials).
const getErrorDiagnostics = (
  value: unknown,
  depth = 0,
): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || depth >= 5) return undefined
  if (Array.isArray(value)) {
    return {
      validationIssues: getValidationIssues(value),
    }
  }
  const error = value as Record<string, unknown>
  return {
    errorTag: typeof error._tag === 'string' ? error._tag : undefined,
    errorName:
      value instanceof Error || value instanceof DOMException
        ? value.name
        : undefined,
    errorCode: getErrorCode(error.code),
    stage: typeof error.stage === 'string' ? error.stage : undefined,
    reason: typeof error.reason === 'string' ? error.reason : undefined,
    claim: typeof error.claim === 'string' ? error.claim : undefined,
    status: typeof error.status === 'number' ? error.status : undefined,
    telegramErrorCode:
      typeof error.errorCode === 'number' ? error.errorCode : undefined,
    telegramReason: getTelegramReason(error),
    method: error.method === 'sendMessage' ? error.method : undefined,
    retryAfter: getRetryAfter(error.parameters),
    providerError:
      typeof error.providerError === 'string' ? error.providerError : undefined,
    recoveryOperation:
      typeof error.operation === 'string' ? error.operation : undefined,
    attemptId:
      typeof error.attemptId === 'string' ? error.attemptId : undefined,
    cause: getErrorDiagnostics(error.cause, depth + 1),
    // createIntoError stores its original exception under `error`, not `cause`.
    error: getErrorDiagnostics(error.error, depth + 1),
    issues: getErrorDiagnostics(error.issues, depth + 1),
    failure: getErrorDiagnostics(error.failure, depth + 1),
  }
}

export const logTelegramLoginFailure = (
  operation: string,
  error: {
    readonly _tag: string
    readonly failure?: { readonly _tag: string }
  },
) => {
  const metadata = {
    operation,
    ...getErrorDiagnostics(error),
    failureTag: error.failure?._tag,
  }
  if (
    error._tag === 'DATABASE_ERROR' ||
    error._tag === 'TELEGRAM_ATTEMPT_RECOVERY_ERROR'
  ) {
    logger.error('Telegram login failed', metadata)
  } else {
    logger.warn('Telegram login unsuccessful', metadata)
  }
}
