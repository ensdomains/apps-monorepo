import { vValidator } from '@hono/valibot-validator'
import type { GenericIssue } from 'valibot'
import * as v from 'valibot'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import {
  cancelTelegramAttempt,
  getTelegramAttempt,
} from '#services/telegram/attempts.js'
import {
  finishTelegramLogin,
  startTelegramLogin,
} from '#services/telegram/login.js'
import { logger } from '#utils/logger.js'
import { telegramCallbackPage } from './telegram-callback.js'

const idParam = v.object({ id: v.pipe(v.string(), v.uuid()) })

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

const logFailure = (
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

export default createApp()
  .basePath('/telegram')
  .use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    c.header('Referrer-Policy', 'no-referrer')
    await next()
  })
  .post('/oauth', ...requireAuth, injectDb, async (c) => {
    const result = await startTelegramLogin(c.var.db, c.env, c.var.user_id)
    if (result.isOk()) return c.json(result.value)
    logFailure('initiate', result.error)
    switch (result.error._tag) {
      case 'TELEGRAM_CONFIGURATION_ERROR':
        return c.json({ error: 'Telegram login is not configured' }, 503)
      case 'TELEGRAM_ATTEMPT_THROTTLED':
        return c.json(
          { error: 'Please wait a few seconds before trying again' },
          429,
        )
      default:
        return c.json({ error: 'Could not start Telegram login' }, 500)
    }
  })
  .get('/oauth', ...requireAuth, injectDb, async (c) => {
    const result = await getTelegramAttempt(c.var.db, c.var.user_id)
    if (result.isErr()) {
      logFailure('status', result.error)
      return c.json({ error: 'Could not check Telegram login' }, 500)
    }
    return c.json({ attempt: result.value })
  })
  .delete(
    '/oauth/:id',
    ...requireAuth,
    injectDb,
    vValidator('param', idParam),
    async (c) => {
      const result = await cancelTelegramAttempt(
        c.var.db,
        c.var.user_id,
        c.req.valid('param').id,
      )
      if (result.isErr()) {
        logFailure('cancel', result.error)
        return c.json({ error: 'Could not cancel Telegram login' }, 500)
      }
      return c.json({ ok: true })
    },
  )
  .get('/callback', injectDb, async (c) => {
    const nonce = crypto.randomUUID()
    c.header(
      'Content-Security-Policy',
      `default-src 'none'; style-src 'nonce-${nonce}'; font-src https://fonts.ens.dev; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
    )
    c.header('X-Content-Type-Options', 'nosniff')
    const result = await finishTelegramLogin(
      c.var.db,
      c.env,
      new URL(c.req.url).searchParams,
    )
    if (result.isErr()) logFailure('callback', result.error)
    return c.html(
      telegramCallbackPage({
        isSuccess: result.isOk(),
        nonce,
        managerUrl: c.env.MANAGER_APP_URL,
      }),
    )
  })
