import { createApp } from "#app/middleware/hono.js"
import { getExpiry } from "#services/expiry/index.js"
import { vValidator } from "@hono/valibot-validator"
import * as v from 'valibot'

export default createApp()
  .basePath('/expiry')
  .post('/', vValidator('json', v.object({
    names: v.array(v.string()),
  })), async (c) => {
    const { names } = c.req.valid('json')

    const expiry = await getExpiry(names)

    return c.json({ expiry })
  })