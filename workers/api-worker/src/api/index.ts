import { HTTPException } from 'hono/http-exception'
import { logger, prettifyError } from '@/utils/logger'
import authApp from './routes/auth'
import { createApp } from './utils/hono'

const app = createApp()

app.route('/auth', authApp)

app.onError((err, c) => {
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
