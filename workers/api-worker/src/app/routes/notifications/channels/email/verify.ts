import { vValidator } from '@hono/valibot-validator'
import { and, eq, gt } from 'drizzle-orm'
import * as v from 'valibot'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { TABLE } from '#core/database/index.js'

export default createApp().post(
  '/',
  vValidator('json', v.object({ token: v.string() })),
  injectDb,
  async (c) => {
    const { token } = c.req.valid('json')

    const verification = await c.var.db.query.channelVerifications.findFirst({
      where: and(
        eq(TABLE.channelVerifications.token, token),
        eq(TABLE.channelVerifications.purpose, 'verify'),
        gt(TABLE.channelVerifications.expires_at, new Date()),
      ),
      with: {
        channel: true,
      },
    })

    if (!verification) {
      return c.json({ error: 'Invalid or expired verification token' }, 400)
    }

    // Mark channel as verified
    await c.var.db
      .update(TABLE.userChannels)
      .set({
        status: 'verified',
        verified_at: new Date(),
      })
      .where(eq(TABLE.userChannels.id, verification.channel_id))

    // Delete the verification record
    await c.var.db
      .delete(TABLE.channelVerifications)
      .where(eq(TABLE.channelVerifications.id, verification.id))

    return c.json({ message: 'Email verified successfully' })
  },
)
