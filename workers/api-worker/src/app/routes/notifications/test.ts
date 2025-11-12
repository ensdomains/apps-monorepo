import { vValidator } from '@hono/valibot-validator'
import * as v from 'valibot'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { createNotification } from '#services/notifications/create.js'
import type {
  NotificationKind,
  NotificationPayloads,
} from '#types/notifications.js'

export default createApp().post(
  '/',
  ...requireAuth,
  injectDb,
  vValidator(
    'json',
    v.object({
      kind: v.string(),
      payload: v.any(),
    }),
  ),
  async (c) => {
    const userId = c.var.user_id
    const { kind, payload } = c.req.valid('json')
    console.log('kind', kind)
    console.log('payload', payload)

    const result = await createNotification({
      db: c.var.db,
      env: c.env,
      userId,
      kind: kind as NotificationKind,
      payload: payload as NotificationPayloads[NotificationKind],
      idempotencyKey: `test-${kind}-${userId}-${Date.now()}`,
    })

    if (result.isErr()) {
      console.error(result.error)
      return c.json({ error: result.error }, 500)
    }

    return c.json({ success: true, data: result.value })
  },
)
