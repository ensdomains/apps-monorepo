import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import fundApp from './routes/fund'
import profileApp from './routes/profile'
import { createApp } from './utils/hono'
import { logger, prettifyError } from './utils/logger'

const app = createApp()

app.use(
  '/*',
  cors({
    origin: (origin) => {
      // Allow requests with no origin (like mobile apps, Postman, curl, etc.)
      if (!origin) return '*'
      // Allow localhost for development
      if (
        origin.startsWith('http://localhost:') ||
        origin.startsWith('https://localhost:')
      ) {
        return origin
      }
      // Allow the production manager app
      if (
        origin.includes('ens.workers.dev') ||
        origin.includes('ens.domains')
      ) {
        return origin
      }
      // Default: allow all origins (for development)
      return '*'
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Type'],
    credentials: true,
  }),
)

app.route('/p', profileApp)
app.route('/p', fundApp)

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
