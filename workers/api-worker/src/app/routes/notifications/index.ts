import { vValidator } from '@hono/valibot-validator'
import { and, desc, eq, lt, sql } from 'drizzle-orm'
import * as v from 'valibot'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { schema } from '#core/database/index.js'
import type { Prettify } from '#types/helpers.js'
import type { Broadcasts, Notifications } from '#types/notifications.js'

export default createApp()
  .basePath('/notifications')
  .get(
    '/',
    ...requireAuth,
    injectDb,
    vValidator(
      'query',
      v.object({
        // limit: v.optional(coerceNumber),
        cursor: v.optional(v.string()),
      }),
    ),
    async (c) => {
      const { cursor } = c.req.valid('query')
      const limit = 20
      const userId = c.var.user_id

      //
      // Personal notifications (can be millions)
      //
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
          eq(schema.notifications.user_id, userId),
          cursor ? lt(schema.notifications.id, cursor) : undefined,
        ),
        orderBy: desc(schema.notifications.id),
        limit: limit,
      })

      type TypedNotification = Prettify<
        Omit<(typeof personal)[number], 'kind' | 'payload'>
      > &
        {
          [K in keyof Notifications]: {
            kind: K
            payload: Notifications[K]
          }
        }[keyof Notifications]

      //
      // Broadcast notifications (tiny table, always a simple scan)
      //
      const broadcasts = await c.var.db
        .select({
          id: schema.broadcasts.id,
          kind: schema.broadcasts.kind,
          payload: schema.broadcasts.payload,
          created_at: schema.broadcasts.created_at,
          seen: sql<boolean>`${schema.broadcastsSeen.created_at} is not null`,
          source: sql<'broadcast'>`'broadcast'`,
        })
        .from(schema.broadcasts)
        .leftJoin(
          schema.broadcastsSeen,
          and(
            eq(schema.broadcasts.id, schema.broadcastsSeen.broadcast_id),
            eq(schema.broadcastsSeen.user_id, userId),
          ),
        )
        .where(cursor ? lt(schema.broadcasts.id, cursor) : undefined)
        .orderBy(desc(schema.broadcasts.id))
        .limit(limit) // ← cheap, table is tiny

      type TypedBroadcast = Prettify<
        Omit<(typeof broadcasts)[number], 'kind' | 'payload'>
      > &
        {
          [K in keyof Broadcasts]: {
            kind: K
            payload: Broadcasts[K]
          }
        }[keyof Broadcasts]

      //
      // Merge + sort in memory
      //
      const merged = [
        ...(personal as TypedNotification[]),
        ...(broadcasts as TypedBroadcast[]),
      ]
        .sort(
          (a, b) => b.id.localeCompare(a.id), // since uuidv7 is time-ordered
        )
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
