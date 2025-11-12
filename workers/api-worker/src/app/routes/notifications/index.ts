import { vValidator } from '@hono/valibot-validator'
import { and, desc, eq, lt, sql } from 'drizzle-orm'
import * as v from 'valibot'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { TABLE } from '#core/database/index.js'
import type { DiscriminatedPayloadMapper } from '#types/helpers.js'
import type { Broadcasts, UserNotifications } from '#types/notifications.js'
import archiveRoutes from './archive.js'
import channelsRoutes from './channels/index.js'
import preferencesRoutes from './preferences/index.js'
import readRoutes from './read.js'
import testRoutes from './test.js'
import unreadCountRoutes from './unread-count.js'

export default createApp()
  .route('/channels', channelsRoutes)
  .route('/preferences', preferencesRoutes)
  .route('/unread-count', unreadCountRoutes)
  .route('/read', readRoutes)
  .route('/archive', archiveRoutes)
  .route('/test', testRoutes)
  .get(
    '/',
    ...requireAuth,
    injectDb,
    vValidator(
      'query',
      v.object({
        // limit: v.optional(coerceNumber), // Currently hardcoded to 20
        cursor: v.optional(v.string()), // UUIDv7 for cursor-based pagination
      }),
    ),
    async (c) => {
      const { cursor } = c.req.valid('query')
      const limit = 20 // Fixed page size for consistent performance
      const userId = c.var.user_id

      //
      // Personal notifications (user-specific events like name expiry, transfers)
      // These can scale to millions per user, so we use cursor-based pagination
      //
      const personal = await c.var.db.query.notifications.findMany({
        columns: {
          id: true,
          kind: true,
          payload: true,
          created_at: true,
        },
        extras: (table) => ({
          // Mark as seen if read_at is not null
          seen: sql<boolean>`${table.read_at} is not null`.as('seen'),
          // Tag as personal notification for client-side handling
          source: sql<'personal'>`'personal'`.as('source'),
        }),
        where: and(
          eq(TABLE.notifications.user_id, userId),
          // Cursor-based pagination: get notifications older than cursor
          // Note: If cursor is invalid UUID, this will return no results (graceful degradation)
          cursor ? lt(TABLE.notifications.id, cursor) : undefined,
        ),
        orderBy: desc(TABLE.notifications.id), // Newest first (UUIDv7 is time-ordered)
        limit: limit,
      })

      //
      // Broadcast notifications (system-wide announcements like blog posts)
      // This table is small, so we can always do a simple scan
      //
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
        .limit(limit) // ← cheap, table is tiny (broadcasts are system-wide, not user-specific)

      //
      // Merge personal and broadcast notifications, then sort by creation time
      // Since both use UUIDv7 (time-ordered), we can sort by ID for chronological order
      //
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
        .sort(
          (a, b) => b.id.localeCompare(a.id), // UUIDv7 is time-ordered, so ID comparison works
        )
        .map(({ created_at, ...rest }) => ({
          ...rest,
          // Convert Date to timestamp for easier client-side handling
          timestamp: created_at.getTime(),
        }))

      // Apply final limit after merging and sorting
      const page = merged.slice(0, limit)

      return c.json({
        notifications: page,
        // Return the last notification's ID as the next cursor, or null if no more pages
        nextCursor: page.length ? page[page.length - 1].id : null,
      })
    },
  )
