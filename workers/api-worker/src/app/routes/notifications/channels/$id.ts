import { and, eq, sql } from 'drizzle-orm'
import { okAsync } from 'neverthrow'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { TABLE } from '#core/database/index.js'
import {
  type PublicChannel,
  toPublicChannel,
} from '#services/notifications/helpers.js'
import { deleteContact, searchContact } from '#services/sendgrid/contacts.js'
import { logger } from '#utils/logger.js'

export default createApp()
  .basePath('/:id')
  .get('/', ...requireAuth, injectDb, async (c) => {
    const userId = c.var.user_id
    const channelId = c.req.param('id')

    const channel = await c.var.db.query.userChannels.findFirst({
      columns: {
        id: true,
        channel: true,
        target: true,
        data: true,
        status: true,
        status_reason: true,
        verified_at: true,
        last_sent_at: true,
        last_bounce_at: true,
      },
      where: and(
        eq(TABLE.userChannels.user_id, userId),
        eq(TABLE.userChannels.id, channelId),
      ),
    })

    if (!channel) {
      return c.json({ error: 'Channel not found' }, 404)
    }

    const publicChannelResult = await toPublicChannel(channel)

    if (publicChannelResult.isErr()) {
      logger.error('Failed to map public channel response', {
        channelId,
        userId,
        error: publicChannelResult.error,
      })
      return c.json({ error: 'Failed to map channel response' }, 500)
    }

    return c.json<PublicChannel>(publicChannelResult.value)
  })
  .delete('/', ...requireAuth, injectDb, async (c) => {
    const userId = c.var.user_id
    const channelId = c.req.param('id')

    const channel = await c.var.db.query.userChannels.findFirst({
      where: and(
        eq(TABLE.userChannels.id, channelId),
        eq(TABLE.userChannels.user_id, userId),
      ),
    })

    if (!channel) {
      return c.json({ error: 'Channel not found' }, 404)
    }

    await c.var.db
      .delete(TABLE.userChannels)
      .where(eq(TABLE.userChannels.id, channelId))

    // SendGrid marketing contacts are keyed by email, so another account may
    // still need this contact after this channel is removed.
    if (
      channel.channel === 'email' &&
      channel.target &&
      c.env.SENDGRID_BROADCAST_LIST_ID
    ) {
      const remaining = await c.var.db.query.userChannels.findFirst({
        columns: { id: true },
        where: and(
          eq(TABLE.userChannels.channel, 'email'),
          eq(TABLE.userChannels.status, 'verified'),
          sql`lower(${TABLE.userChannels.target}) = lower(${channel.target})`,
        ),
      })
      if (remaining) return c.json({ message: 'Channel deleted successfully' })

      const env = {
        SENDGRID_API_KEY: c.env.SENDGRID_API_KEY,
        SENDGRID_BROADCAST_LIST_ID: c.env.SENDGRID_BROADCAST_LIST_ID,
      }
      c.executionCtx.waitUntil(
        Promise.resolve(
          searchContact(env, channel.target).andThen((contact) =>
            contact ? deleteContact(env, contact.id) : okAsync(undefined),
          ),
        ).then((result) => {
          if (result.isErr()) {
            logger.error('Failed to delete contact from SendGrid', {
              email: channel.target,
              error: result.error,
            })
          } else {
            logger.info('Deleted contact from SendGrid', {
              email: channel.target,
            })
          }
        }),
      )
    }

    return c.json({ message: 'Channel deleted successfully' })
  })
  .post('/test', ...requireAuth, injectDb, async (c) => {
    const userId = c.var.user_id
    const channelId = c.req.param('id')

    const channel = await c.var.db.query.userChannels.findFirst({
      where: and(
        eq(TABLE.userChannels.id, channelId),
        eq(TABLE.userChannels.user_id, userId),
      ),
    })

    if (!channel) {
      return c.json({ error: 'Channel not found' }, 404)
    }

    if (channel.status !== 'verified') {
      return c.json(
        { error: 'Channel must be verified to send test notifications' },
        400,
      )
    }

    // TODO: Send test notification based on channel type
    // For now, just update the last_sent_at timestamp
    await c.var.db
      .update(TABLE.userChannels)
      .set({
        last_sent_at: new Date(),
      })
      .where(eq(TABLE.userChannels.id, channelId))

    return c.json({ message: 'Test notification sent successfully' })
  })
