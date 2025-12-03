import { vValidator } from '@hono/valibot-validator'
import * as v from 'valibot'
import { createApp } from '#app/middleware/hono.js'
import { getExpiry } from '#services/expiry/index.js'

export default createApp()
  .basePath('/expiry')
  .post(
    '/',
    vValidator(
      'json',
      v.object({
        names: v.array(v.string()),
      }),
    ),
    async (c) => {
      const { names } = c.req.valid('json')

      const expiryResult = await getExpiry(names)

      if (expiryResult.isErr()) {
        console.error('Failed to fetch expiry data:', expiryResult.error)
        return c.json({ error: 'Failed to fetch expiry data' }, 500)
      }

      return c.json({ expiry: expiryResult.value })
    },
  )
