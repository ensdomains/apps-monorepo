import { vValidator } from '@hono/valibot-validator'
import { and, desc, eq, lt, sql } from 'drizzle-orm'
import * as v from 'valibot'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { TABLE } from '#core/database/index.js'
import type { DiscriminatedPayloadMapper } from '#types/helpers.js'
import type { Broadcasts, UserNotifications } from '#types/notifications.js'

export default createApp().get(
  '/',
  ...requireAuth,
  injectDb,
  vValidator(
    'query',
    v.object({
      cursor: v.optional(v.string()),
    }),
  ),
  async (c) => {
    const { cursor } = c.req.valid('query')
    const limit = 20
    const userId = c.var.user_id

    const personal = await c.var.db.query.notifications.findMany({
      columns: {
        id: true,
        kind: true,
        payload: true,
        created_at: true,
      },
      extras: (table) => ({
        seen: sql<boolean>`${table.read_at} is not null`.as('seen'),
        source: sql<'personal'>`'personal'`.as('source'),
      }),
      where: and(
        eq(TABLE.notifications.user_id, userId),
        cursor ? lt(TABLE.notifications.id, cursor) : undefined,
      ),
      orderBy: desc(TABLE.notifications.id),
      limit: limit,
    })

    const broadcasts = await c.var.db
      .select({
        id: TABLE.broadcasts.id,
        kind: TABLE.broadcasts.kind,
        payload: TABLE.broadcasts.payload,
        created_at: TABLE.broadcasts.created_at,
        seen: sql<boolean>`${TABLE.broadcastsSeen.read_at} is not null`,
        source: sql<'broadcast'>`'broadcast'`,
      })
      .from(TABLE.broadcasts)
      .leftJoin(
        TABLE.broadcastsSeen,
        and(
          eq(TABLE.broadcasts.id, TABLE.broadcastsSeen.broadcast_id),
          eq(TABLE.broadcastsSeen.user_id, userId),
        ),
      )
      .where(cursor ? lt(TABLE.broadcasts.id, cursor) : undefined)
      .orderBy(desc(TABLE.broadcasts.id))
      .limit(limit)

    const merged = [
      ...(personal as DiscriminatedPayloadMapper<
        UserNotifications,
        (typeof personal)[number],
        'kind',
        'payload'
      >[]),
      ...(broadcasts as DiscriminatedPayloadMapper<
        Broadcasts,
        (typeof broadcasts)[number],
        'kind',
        'payload'
      >[]),
    ]
      .sort((a, b) => b.id.localeCompare(a.id))
      .map(({ created_at, ...rest }) => ({
        ...rest,
        timestamp: created_at.getTime(),
      }))

    const page = merged.slice(0, limit)

    return c.json({
      notifications: page,
      nextCursor: page.length ? page[page.length - 1].id : null,
    })
  },
)
