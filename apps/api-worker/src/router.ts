import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import profileApp from './routes/profile'
import { createApp } from './utils/hono'
import { logger, prettifyError } from './utils/logger'

const app = createApp()

app.use('/*', cors())

app.route('/p', profileApp)

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    // Get the custom response
    return err.getResponse()
  }

  logger.error('Internal server error', {
    path: c.req.path,
    method: c.req.method,
    error: prettifyError(err),
  })

  return c.json({ error: 'Internal server error' }, 500)
})

export default app
