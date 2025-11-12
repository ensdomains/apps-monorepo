import { vValidator } from '@hono/valibot-validator'
import { and, eq } from 'drizzle-orm'
import * as v from 'valibot'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { TABLE } from '#core/database/index.js'
import {
  TelegramAuthSchema,
  verifyTelegramAuth,
} from '#services/telegram/auth.js'
import { makeTelegramRequest } from '#services/telegram/utils.js'
import { logger } from '#utils/logger.js'

export default createApp().post(
  '/',
  ...requireAuth,
  injectDb,
  vValidator('json', v.object({ auth_data: TelegramAuthSchema })),
  async (c) => {
    const userId = c.var.user_id
    const { auth_data } = c.req.valid('json')

    const authResult = await verifyTelegramAuth(
      c.env.TELEGRAM_BOT_TOKEN,
      auth_data,
    )
    if (authResult.isErr()) {
      switch (authResult.error.code) {
        case 'TELEGRAM_AUTH_DATA_EXPIRED':
          return c.json({ error: 'Telegram auth data expired' }, 400)
        case 'TELEGRAM_AUTH_DATA_HASH_MISMATCH':
          return c.json({ error: 'Telegram auth data hash mismatch' }, 400)
        default:
          return c.json({ error: 'Failed to verify Telegram auth data' }, 400)
      }
    }

    const existingChannel = await c.var.db.query.userChannels.findFirst({
      where: and(
        eq(TABLE.userChannels.user_id, userId),
        eq(TABLE.userChannels.channel, 'telegram'),
        eq(TABLE.userChannels.target, auth_data.id.toString()),
      ),
    })

    if (existingChannel) {
      return c.json({ error: 'Channel already exists' }, 400)
    }

    const channel = await c.var.db
      .insert(TABLE.userChannels)
      .values({
        user_id: userId,
        channel: 'telegram',
        status: 'verified',
        verified_at: new Date(),
        target: auth_data.id.toString(),
        data: {
          username: auth_data.username,
        },
      })
      .returning({
        id: TABLE.userChannels.id,
      })
      .then((channels) => channels.at(0))

    if (!channel) {
      return c.json({ error: 'Failed to create channel' }, 400)
    }

    const messageResult = await makeTelegramRequest(
      c.env.TELEGRAM_BOT_TOKEN,
      'sendMessage',
      {
        chat_id: auth_data.id,
        text: 'Welcome to the bot!',
      },
    )

    if (messageResult.isErr()) {
      logger.error('Failed to send telegram message on channel creation', {
        error: messageResult.error,
        channelId: channel.id,
      })
      return c.json({ error: 'Failed to send message' }, 400)
    }

    return c.json({ ok: true })
  },
)
