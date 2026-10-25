import { vValidator } from '@hono/valibot-validator'
import * as v from 'valibot'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import {
  cancelTelegramAttempt,
  getTelegramAttempt,
} from '#services/telegram/attempts.js'
import { logTelegramLoginFailure } from '#services/telegram/logging.js'
import {
  finishTelegramLogin,
  startTelegramLogin,
} from '#services/telegram/login.js'
import { telegramCallbackPage } from './telegram-callback.js'

const idParam = v.object({ id: v.pipe(v.string(), v.uuid()) })

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
    logTelegramLoginFailure('initiate', result.error)
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
      logTelegramLoginFailure('status', result.error)
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
        logTelegramLoginFailure('cancel', result.error)
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
    if (result.isErr()) logTelegramLoginFailure('callback', result.error)
    return c.html(
      telegramCallbackPage({
        isSuccess: result.isOk(),
        error: result.isErr() ? result.error : undefined,
        nonce,
        managerUrl: c.env.MANAGER_APP_URL,
      }),
    )
  })
