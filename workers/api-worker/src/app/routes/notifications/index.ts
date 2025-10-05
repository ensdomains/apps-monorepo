import { vValidator } from '@hono/valibot-validator'
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm'
import * as v from 'valibot'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { TABLE } from '#core/database/index.js'
import type { DiscriminatedPayloadMapper, Prettify } from '#types/helpers.js'
import type { Broadcasts, UserNotifications } from '#types/notifications.js'
import channels from './channels.js'
import preferences from './preferences.js'

/**
 * Notification routes for managing user notifications and broadcasts.
 *
 * This module handles:
 * - Personal notifications (user-specific events like name expiry, transfers)
 * - Broadcast notifications (system-wide announcements like blog posts)
 * - Pagination using cursor-based approach with UUIDv7 timestamps
 * - Marking notifications as read/unread and archived
 */
export default createApp()
  .basePath('/notifications')
  .route('/', channels)
  .route('/', preferences)
  /**
   * GET /notifications
   *
   * Retrieves a paginated list of notifications for the authenticated user.
   * Combines personal notifications and broadcast notifications, sorted by creation time.
   *
   * @param cursor - Optional cursor for pagination (UUIDv7 timestamp)
   * @returns Paginated list of notifications with next cursor
   */
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
  /**
   * GET /notifications/unread-count
   *
   * Returns the count of unread personal notifications for the authenticated user.
   * Note: Broadcast notifications are not included in this count as they're handled separately.
   *
   * @returns Object with unreadCount number
   */
  .get('/unread-count', ...requireAuth, injectDb, async (c) => {
    const userId = c.var.user_id

    // Count only personal notifications that haven't been read
    const unreadCount = await c.var.db.$count(
      TABLE.notifications,
      and(
        eq(TABLE.notifications.user_id, userId),
        isNull(TABLE.notifications.read_at), // read_at is null for unread notifications
      ),
    )

    return c.json({ unreadCount })
  })
  /**
   * PATCH /notifications/read
   *
   * Marks multiple notifications as read. Handles both personal and broadcast notifications.
   * For personal notifications, updates the read_at timestamp.
   * For broadcast notifications, inserts/updates the broadcastsSeen table.
   *
   * @param notifications - Array of notification objects with id and source
   * @param notifications[].id - Notification ID (UUIDv7)
   * @param notifications[].source - Either 'personal' or 'broadcast'
   * @returns Success confirmation
   */
  .patch(
    '/read',
    ...requireAuth,
    injectDb,
    vValidator(
      'json',
      v.pipe(
        v.array(
          v.object({
            id: v.string(), // UUIDv7 notification ID
            source: v.picklist(['personal', 'broadcast']), // Notification type
          }),
        ),
        v.maxLength(100), // Prevent abuse with large batch sizes
      ),
    ),
    async (c) => {
      const notifications = c.req.valid('json')
      const userId = c.var.user_id

      // Separate personal and broadcast notifications for different handling
      const personal = notifications
        .filter((n) => n.source === 'personal')
        .map((n) => n.id)
      const broadcast = notifications
        .filter((n) => n.source === 'broadcast')
        .map((n) => n.id)

      // Update personal notifications: set read_at timestamp
      if (personal.length > 0) {
        await c.var.db
          .update(TABLE.notifications)
          .set({
            read_at: new Date(),
          })
          .where(
            and(
              inArray(TABLE.notifications.id, personal),
              eq(TABLE.notifications.user_id, userId),
              // Only update if not already read (defensive programming)
              isNull(TABLE.notifications.read_at),
            ),
          )
      }

      const now = sql`now()`

      // Handle broadcast notifications: insert into broadcastsSeen table
      if (broadcast.length > 0) {
        await c.var.db
          .insert(TABLE.broadcastsSeen)
          .values(
            broadcast.map((id) => ({
              user_id: userId,
              broadcast_id: id,
              read_at: now,
            })),
          )
          .onConflictDoNothing() // Ignore if already marked as seen
      }

      return c.json({
        success: true,
      })
    },
  )
  /**
   * PATCH /notifications/archive
   *
   * Marks multiple notifications as archived. Similar to read endpoint but sets archived_at.
   * For personal notifications, updates the archived_at timestamp.
   * For broadcast notifications, updates the broadcastsSeen table with archived_at.
   *
   * @param notifications - Array of notification objects with id and source
   * @param notifications[].id - Notification ID (UUIDv7)
   * @param notifications[].source - Either 'personal' or 'broadcast'
   * @returns Success confirmation
   */
  .patch(
    '/archive',
    ...requireAuth,
    injectDb,
    vValidator(
      'json',
      v.pipe(
        v.array(
          v.object({
            id: v.string(), // UUIDv7 notification ID
            source: v.picklist(['personal', 'broadcast']), // Notification type
          }),
        ),
        v.maxLength(100), // Prevent abuse with large batch sizes
      ),
    ),
    async (c) => {
      const notifications = c.req.valid('json')
      const userId = c.var.user_id

      // Separate personal and broadcast notifications for different handling
      const personal = notifications
        .filter((n) => n.source === 'personal')
        .map((n) => n.id)
      const broadcast = notifications
        .filter((n) => n.source === 'broadcast')
        .map((n) => n.id)

      const now = sql`now()`

      // Update personal notifications: set archived_at timestamp
      if (personal.length > 0) {
        await c.var.db
          .update(TABLE.notifications)
          .set({
            archived_at: new Date(),
          })
          .where(
            and(
              inArray(TABLE.notifications.id, personal),
              eq(TABLE.notifications.user_id, userId),
              // Only update if not already archived (defensive programming)
              isNull(TABLE.notifications.archived_at),
            ),
          )
      }

      // Handle broadcast notifications: update broadcastsSeen table with archived_at
      if (broadcast.length > 0) {
        await c.var.db
          .insert(TABLE.broadcastsSeen)
          .values(
            broadcast.map((id) => ({
              user_id: userId,
              broadcast_id: id,
              read_at: now,
              archived_at: now,
            })),
          )
          .onConflictDoUpdate({
            // Update existing record if user has already seen this broadcast
            target: [
              TABLE.broadcastsSeen.user_id,
              TABLE.broadcastsSeen.broadcast_id,
            ],
            set: {
              archived_at: now,
            },
          })
      }

      return c.json({
        success: true,
      })
    },
  )
