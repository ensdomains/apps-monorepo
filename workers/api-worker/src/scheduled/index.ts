import { getDatabase } from '#core/database/index.js'
import { evaluateExpiringNames } from '#services/expiry/evaluate.js'

export const handleScheduled: ExportedHandlerScheduledHandler<
  CloudflareBindings
> = async (controller, env, _ctx): Promise<void> => {
  console.log(
    `Scheduled event triggered: ${controller.cron} at ${new Date(controller.scheduledTime).toISOString()}`,
  )

  const db = getDatabase(env)
  const result = await evaluateExpiringNames(env, db)

  if (result.isErr()) {
    console.error('Scheduled expiry evaluation failed:', result.error)
    // Don't throw - we don't want to retry the entire cron job
    // Individual name processing errors are handled in the evaluation service
    return
  }

  console.log('Scheduled expiry evaluation completed successfully')
}
