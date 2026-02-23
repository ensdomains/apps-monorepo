import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { logger } from '#utils/logger.js'
import { createApp } from './middleware/hono'
import authApp from './routes/auth'
import favoritesApp from './routes/favorites'
import notificationsApp from './routes/notifications'
import walletApp from './routes/wallet'
import webhookApp from './routes/webhook'

const app = createApp()
  .use('/*', cors())
  .route('/', authApp)
  .route('/', favoritesApp)
  .route('/', notificationsApp)
  .route('/', webhookApp)
  .route('/', walletApp)
  .onError((err, c) => {
    if (err instanceof HTTPException) {
      // Get the custom response
      return err.getResponse()
    }

    logger.error('Internal server error', {
      path: c.req.path,
      method: c.req.method,
      error: err,
    })

    return c.json({ error: 'Internal server error' }, 500)
  })

export default app
