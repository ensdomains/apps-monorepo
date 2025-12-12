import { vValidator } from '@hono/valibot-validator'
import type { Context } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { match, P } from 'ts-pattern'
import * as v from 'valibot'
import { requireAuth } from '#app/middleware/auth.js'
import {
  createJWT,
  createNonce,
  revokeSessionByRefreshToken,
  rotateSession,
} from '#services/auth/index.js'
import { ethAddress, hex } from '#utils/validation.js'
import { injectDb } from '../../middleware/database'
import { injectEthClient } from '../../middleware/eth'
import { createApp, internalServerError } from '../../middleware/hono'

const REFRESH_COOKIE_NAME = '__Host-refresh'
const CSRF_COOKIE_NAME = '__Host-csrf'
const REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

const generateCsrfToken = () => crypto.randomUUID()

const setRefreshCookies = (c: Context, refreshToken: string, csrf?: string) => {
  setCookie(c, REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/auth',
    maxAge: REFRESH_COOKIE_MAX_AGE,
  })

  setCookie(c, CSRF_COOKIE_NAME, csrf ?? generateCsrfToken(), {
    secure: true,
    sameSite: 'none',
    path: '/auth',
    maxAge: REFRESH_COOKIE_MAX_AGE,
  })
}

const clearRefreshCookies = (c: Context) => {
  setCookie(c, REFRESH_COOKIE_NAME, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/auth',
    maxAge: 0,
  })

  setCookie(c, CSRF_COOKIE_NAME, '', {
    secure: true,
    sameSite: 'none',
    path: '/auth',
    maxAge: 0,
  })
}

export default createApp()
  .basePath('/auth')
  .post('/nonce', async (c) => {
    const nonce = await createNonce(c.env)

    if (nonce.isErr()) {
      return c.json({ error: 'Failed to create nonce' }, 500)
    }

    return c.json({ nonce: nonce.value }, 200)
  })
  .post(
    '/login',
    vValidator(
      'json',
      v.object({
        address: ethAddress,
        message: v.string(),
        signature: hex,
        nonce: v.string(),
      }),
    ),
    injectEthClient,
    injectDb,
    async (c) => {
      const { address, message, signature, nonce } = c.req.valid('json')

      const jwt = await createJWT({
        env: c.env,
        client: c.var.ethClient,
        db: c.var.db,
        address,
        message,
        signature,
        nonce,
        userAgent: c.req.header('user-agent'),
        ip: c.req.header('cf-connecting-ip'),
      })

      if (jwt.isErr()) {
        return match(jwt.error)
          .with({ _tag: 'INVALID_SIGNATURE' }, () =>
            c.json({ error: 'Invalid signature' }, 400),
          )
          .with({ _tag: 'INVALID_NONCE' }, () =>
            c.json({ error: 'Invalid nonce' }, 400),
          )
          .with({ _tag: 'HASH_REFRESH_TOKEN_ERROR' }, (error) =>
            internalServerError(c, error),
          )
          .with(
            {
              _tag: P.union(
                'DATABASE_ERROR',
                'KV_ERROR',
                'SIGN_JWT_ERROR',
                'SIWE_VERIFY_ERROR',
              ),
            },
            (error) => internalServerError(c, error),
          )
          .exhaustive()
      }

      setRefreshCookies(c, jwt.value.refreshToken)

      return c.json({ token: jwt.value.accessToken })
    },
  )
  .post('/refresh', injectDb, async (c) => {
    const refreshToken = getCookie(c, REFRESH_COOKIE_NAME)
    const csrfCookie = getCookie(c, CSRF_COOKIE_NAME)
    const csrfHeader = c.req.header('x-csrf')

    if (!refreshToken) {
      return c.json({ error: 'Missing refresh token' }, 401)
    }

    if (csrfCookie && csrfHeader !== csrfCookie) {
      return c.json({ error: 'Invalid CSRF token' }, 403)
    }

    const rotation = await rotateSession({
      env: c.env,
      db: c.var.db,
      refreshToken,
      origin: c.req.header('origin') ?? c.req.header('referer') ?? undefined,
    })

    if (rotation.isErr()) {
      const result = match(rotation.error)
        .with(
          { _tag: P.union('INVALID_REFRESH_TOKEN', 'EXPIRED_REFRESH_TOKEN') },
          () => {
            clearRefreshCookies(c)
            return c.json({ error: 'Invalid refresh token' }, 401)
          },
        )
        .with({ _tag: 'REFRESH_TOKEN_REUSE' }, () => {
          clearRefreshCookies(c)
          return c.json({ error: 'Session revoked' }, 401)
        })
        .with({ _tag: 'REVOKED_SESSION' }, () => {
          clearRefreshCookies(c)
          return c.json({ error: 'Session revoked' }, 401)
        })
        .with({ _tag: 'DOMAIN_MISMATCH' }, () =>
          c.json({ error: 'Origin mismatch' }, 403),
        )
        .with(
          {
            _tag: P.union(
              'HASH_REFRESH_TOKEN_ERROR',
              'DATABASE_ERROR',
              'SIGN_JWT_ERROR',
            ),
          },
          (error) => internalServerError(c, error),
        )
        .exhaustive()

      return result
    }

    setRefreshCookies(c, rotation.value.refreshToken)

    return c.json({ token: rotation.value.accessToken })
  })
  .post('/logout', injectDb, async (c) => {
    const refreshToken = getCookie(c, REFRESH_COOKIE_NAME)

    if (refreshToken) {
      await revokeSessionByRefreshToken({
        env: c.env,
        db: c.var.db,
        refreshToken,
      })
    }

    clearRefreshCookies(c)

    return c.json({ success: true })
  })
  .get('/me', ...requireAuth, async (c) => {
    return c.json({ address: c.var.address })
  })
