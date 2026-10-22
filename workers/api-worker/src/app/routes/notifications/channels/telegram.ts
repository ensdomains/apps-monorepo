import { vValidator } from '@hono/valibot-validator'
import { html } from 'hono/html'
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

const idParam = v.object({ id: v.pipe(v.string(), v.uuid()) })

// Error causes can contain SQL parameters, provider responses or credentials.
// Preserve them in Results; log only this explicit safe projection.
const logFailure = (
  operation: string,
  error: {
    readonly _tag: string
    readonly failure?: { readonly _tag: string }
  },
) => {
  const metadata = {
    operation,
    errorTag: error._tag,
    failureTag: error.failure?._tag,
    stage: 'stage' in error ? error.stage : undefined,
    reason: 'reason' in error ? error.reason : undefined,
    status: 'status' in error ? error.status : undefined,
    recoveryOperation: 'operation' in error ? error.operation : undefined,
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

// Dynamic provider errors and tokens stay out of HTML, logs and responses.
const callbackPage = (success: boolean) => html`<!doctype html>
  <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ENS Telegram notifications</title></head>
  <body><main><h1>${success ? 'Telegram connected' : 'Telegram connection unsuccessful'}</h1>
  <p>${success ? 'Your Telegram is ready to receive ENS notifications.' : 'The connection expired, was cancelled, or could not be completed. Please return to ENS Manager and try again, allowing the bot to send messages.'}</p>
  <p>You can close this tab and return to your original ENS Manager tab.</p></main></body></html>`

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
    c.header(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    )
    c.header('X-Content-Type-Options', 'nosniff')
    const result = await finishTelegramLogin(
      c.var.db,
      c.env,
      new URL(c.req.url).searchParams,
    )
    if (result.isErr()) logFailure('callback', result.error)
    return c.html(callbackPage(result.isOk()))
  })
