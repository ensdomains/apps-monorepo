import type { GenericIssue } from 'valibot'
import { logger } from '#utils/logger.js'

// Preserve the causal chain without serializing JWT payloads, SQL parameters,
// validation inputs, or arbitrary error messages (which can contain credentials).
const getErrorDiagnostics = (
  value: unknown,
  depth = 0,
): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || depth >= 5) return undefined
  if (Array.isArray(value)) {
    return {
      validationIssues: value.slice(0, 10).map((value: unknown) => {
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
      }),
    }
  }
  const error = value as Record<string, unknown>
  return {
    errorTag: typeof error._tag === 'string' ? error._tag : undefined,
    errorName: value instanceof Error ? value.name : undefined,
    errorCode:
      typeof error.code === 'string' &&
      /^(?:(?:UND_)?ERR_[A-Z0-9_]+|TELEGRAM_[A-Z0-9_]+|[0-9A-Z]{5})$/.test(
        error.code,
      )
        ? error.code
        : undefined,
    stage: typeof error.stage === 'string' ? error.stage : undefined,
    reason: typeof error.reason === 'string' ? error.reason : undefined,
    claim: typeof error.claim === 'string' ? error.claim : undefined,
    status: typeof error.status === 'number' ? error.status : undefined,
    telegramErrorCode:
      typeof error.errorCode === 'number' ? error.errorCode : undefined,
    providerError:
      typeof error.providerError === 'string' ? error.providerError : undefined,
    recoveryOperation:
      typeof error.operation === 'string' ? error.operation : undefined,
    attemptId:
      typeof error.attemptId === 'string' ? error.attemptId : undefined,
    cause: getErrorDiagnostics(error.cause, depth + 1),
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
