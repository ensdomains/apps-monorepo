import { eq } from 'drizzle-orm'
import { requireAuth } from '#app/middleware/auth.js'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { TABLE } from '#core/database/index.js'
import {
  type PublicChannel,
  toPublicChannel,
} from '#services/notifications/helpers.js'
import idRoutes from './$id.js'
import emailRoutes from './email.js'
import pushRoutes from './push.js'
import telegramRoutes from './telegram.js'

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
  .basePath('/channels')
  /**
   * GET /notifications
   *
   * Retrieves a paginated list of notifications for the authenticated user.
   * Combines personal notifications and broadcast notifications, sorted by creation time.
   *
   * @param cursor - Optional cursor for pagination (UUIDv7 timestamp)
   * @returns Paginated list of notifications with next cursor
   */
  .get('/', ...requireAuth, injectDb, async (c) => {
    const userId = c.var.user_id

    const channels = await c.var.db.query.userChannels.findMany({
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
        last_verification_sent_at: true,
      },
      where: eq(TABLE.userChannels.user_id, userId),
    })

    const publicChannels = await Promise.all(
      channels.map((channel) => toPublicChannel(channel)),
    ).then((results) =>
      results.filter((result) => result.isOk()).map((result) => result.value),
    )

    return c.json<PublicChannel[]>(publicChannels)
  })
  .route('/', emailRoutes)
  .route('/', telegramRoutes)
  .route('/', pushRoutes)
  .route('/', idRoutes)
