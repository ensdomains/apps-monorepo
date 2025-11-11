import { HTTPException } from 'hono/http-exception'
import { logger, prettifyError } from '#utils/logger.js'
import { createApp } from './middleware/hono'
import authApp from './routes/auth'
import expiryApp from './routes/expiry'
import favoritesApp from './routes/favorites'
import notificationsApp from './routes/notifications'
import watchersApp from './routes/watchers'
import webhookApp from './routes/webhook'

const app = createApp()
  .route('/auth', authApp)
  .route('/expiry', expiryApp)
  .route('/favorites', favoritesApp)
  .route('/notifications', notificationsApp)
  .route('/', webhookApp)
  .route('/', watchersApp)
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
