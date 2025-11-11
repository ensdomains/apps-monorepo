import type { Update } from '@grammyjs/types'
import { createApp } from '#app/middleware/hono.js'

export default createApp()
  .basePath('/telegram')
  .post('/update', async (c) => {
    const webhookSecretToken = c.req.header('X-Telegram-Bot-Api-Secret-Token')

    if (!webhookSecretToken) {
      return c.json({ message: 'Unauthorized' }, 401)
    }

    if (webhookSecretToken !== c.env.TELEGRAM_WEBHOOK_SECRET) {
      return c.json({ message: 'Unauthorized' }, 401)
    }

    const _update = (await c.req.json()) as Update

    return c.json({ message: 'OK' })
  })
