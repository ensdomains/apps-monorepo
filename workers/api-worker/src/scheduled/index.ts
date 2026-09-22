import { getDatabase } from '#core/database/index.js'
import { cleanupExpiredAuthAttempts } from '#services/auth/cleanup.js'
import { runExpiryDiscoveryCron } from '#services/expiry-discovery/index.js'
import { logger } from '#utils/logger.js'

export const AUTH_CLEANUP_CRON = '17 */3 * * *'

export const handleScheduled: ExportedHandlerScheduledHandler<
  CloudflareBindings
> = async (controller, env, _ctx): Promise<void> => {
  logger.info('Scheduled event triggered', {
    cron: controller.cron,
    scheduledTime: new Date(controller.scheduledTime).toISOString(),
  })

  if (controller.cron === AUTH_CLEANUP_CRON) {
    const result = await cleanupExpiredAuthAttempts(getDatabase(env))

    if (result.isErr()) {
      logger.error('Scheduled auth cleanup failed', {
        cron: controller.cron,
        error: result.error,
      })
      return
    }

    logger.info('Scheduled auth cleanup completed', {
      cron: controller.cron,
      deletedAttempts: result.value,
    })
    return
  }

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
