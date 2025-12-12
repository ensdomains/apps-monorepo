import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { logger, prettifyError } from '#utils/logger.js'
import { createApp } from './middleware/hono'
import authApp from './routes/auth'
import expiryApp from './routes/expiry'
import favoritesApp from './routes/favorites'
import notificationsApp from './routes/notifications'
import walletApp from './routes/wallet'
import watchersApp from './routes/watchers'
import webhookApp from './routes/webhook'

const baseOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
]

const isAllowedOrigin = (
  origin: string | undefined,
  env: CloudflareBindings,
) => {
  if (!origin) return false

  const allowlist = [...baseOrigins, env.MANAGER_APP_URL].filter(Boolean)

  if (allowlist.includes(origin)) {
    return true
  }

  try {
    const hostname = new URL(origin).hostname

    if (hostname.endsWith('.pages.dev')) return true
    if (hostname.endsWith('.vercel.app')) return true
  } catch {
    return false
  }

  return false
}

const app = createApp()
  .use(
    '/*',
    cors({
      origin: (origin, c) => (isAllowedOrigin(origin, c.env) ? origin : false),
      credentials: true,
      allowHeaders: ['Content-Type', 'Authorization', 'X-CSRF'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  )
  .route('/', authApp)
  .route('/', favoritesApp)
  .route('/', notificationsApp)
  .route('/', webhookApp)
  .route('/', expiryApp)
  .route('/', watchersApp)
  .route('/', walletApp)
  .onError((err, c) => {
    if (err instanceof HTTPException) {
      // Get the custom response
      return err.getResponse()
    }

    console.log('err', err)
    logger.error('Internal server error', {
      path: c.req.path,
      method: c.req.method,
      error: prettifyError(err),
    })

    return c.json({ error: 'Internal server error' }, 500)
  })

export default app
