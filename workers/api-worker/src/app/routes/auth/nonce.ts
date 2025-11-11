import { createApp } from '#app/middleware/hono.js'
import { createNonce } from '#services/auth/index.js'

export default createApp().post('/', async (c) => {
  const nonce = await createNonce(c.env)

  if (nonce.isErr()) {
    return c.json({ error: 'Failed to create nonce' }, 500)
  }

  return c.json({ nonce: nonce.value }, 200)
})
