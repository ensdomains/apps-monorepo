import { createApp } from '#app/middleware/hono.js'
import archiveRoute from './archive.js'
import channels from './channels/index.js'
import listRoute from './list.js'
import preferences from './preferences/index.js'
import markReadRoute from './read.js'
import testRoute from './test.js'
import unreadCountRoute from './unread-count.js'

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
  .route('/', listRoute)
  .route('/', unreadCountRoute)
  .route('/', markReadRoute)
  .route('/', archiveRoute)
  .route('/', testRoute)
