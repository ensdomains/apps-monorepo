import { lt, sql } from 'drizzle-orm'
import { getDatabase, schema } from '#core/database/index.js'
import { runExpiryDiscoveryCron } from '#services/expiry-discovery/index.js'
import { logger } from '#utils/logger.js'

/**
 * How long `name_searches` rows are kept. The stats endpoint only reads the
 * last 30 days; the extra buffer leaves room to widen the window later
 * without a data gap.
 */
const NAME_SEARCHES_RETENTION_DAYS = 60

/** Prune search-tracking rows past retention so the table stays bounded. */
async function pruneStaleNameSearches(env: CloudflareBindings): Promise<void> {
  try {
    const db = getDatabase(env)
    const result = await db
      .delete(schema.nameSearches)
      .where(
        lt(
          schema.nameSearches.searched_on,
          sql`CURRENT_DATE - ${NAME_SEARCHES_RETENTION_DAYS}::int`,
        ),
      )

    if (result.rowCount) {
      logger.info('Pruned stale name searches', { deleted: result.rowCount })
    }
  } catch (error) {
    // Non-fatal: retention just retries on the next cron run.
    logger.error('Failed to prune stale name searches', { error })
  }
}

export const handleScheduled: ExportedHandlerScheduledHandler<
  CloudflareBindings
> = async (controller, env, _ctx): Promise<void> => {
  logger.info('Scheduled event triggered', {
    cron: controller.cron,
    scheduledTime: new Date(controller.scheduledTime).toISOString(),
  })

  await pruneStaleNameSearches(env)

  const result = await runExpiryDiscoveryCron(env)

  if (result.isErr()) {
    logger.error('Scheduled expiry discovery failed', {
      cron: controller.cron,
      error: result.error,
    })
    return
  }

  logger.info('Scheduled expiry discovery completed', {
    cron: controller.cron,
    totalEnqueued: result.value.totalEnqueued,
    failedStages: result.value.failedStages,
  })
}
