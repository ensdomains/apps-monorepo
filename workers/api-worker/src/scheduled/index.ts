import { runExpiryDiscoveryCron } from '#services/expiry-discovery/index.js'
import { prettifyError } from '#utils/logger.js'

export const handleScheduled: ExportedHandlerScheduledHandler<
  CloudflareBindings
> = async (controller, env, _ctx): Promise<void> => {
  console.log(
    `Scheduled event triggered: ${controller.cron} at ${new Date(controller.scheduledTime).toISOString()}`,
  )

  const result = await runExpiryDiscoveryCron(env)

  if (result.isErr()) {
    console.error('Scheduled expiry discovery failed', {
      error: prettifyError(result.error),
    })
    return
  }

  console.log('Scheduled expiry discovery completed', {
    totalEnqueued: result.value.totalEnqueued,
    failedStages: result.value.failedStages,
  })
}
