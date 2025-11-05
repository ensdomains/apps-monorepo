import { getDatabase } from '#core/database/index.js'
import { evaluateExpiringNames } from '#services/expiry/evaluate.js'

export const handleScheduled: ExportedHandlerScheduledHandler<
  CloudflareBindings
> = async (controller, env, ctx): Promise<void> => {
  console.log(
    `Scheduled event triggered: ${controller.cron} at ${new Date(controller.scheduledTime).toISOString()}`,
  )

  try {
    const db = getDatabase(env)
    await evaluateExpiringNames(env, db)
    console.log('Scheduled expiry evaluation completed successfully')
  } catch (error) {
    console.error('Scheduled expiry evaluation failed:', error)
    // Don't throw - we don't want to retry the entire cron job
    // Individual name processing errors are handled in the evaluation service
  }
}
