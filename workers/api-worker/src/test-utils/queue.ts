/// <reference types="@cloudflare/vitest-pool-workers/types" />
import {
  createExecutionContext,
  createMessageBatch,
  getQueueResult,
} from 'cloudflare:test'
import worker from '#worker.js'

// Only transport is substituted by callers; ACK/retry semantics are workerd's.
export const runQueue = async (
  queueName: string,
  bodies: readonly unknown[],
  env: CloudflareBindings,
) => {
  const batch = createMessageBatch(
    queueName,
    bodies.map((body, index) => ({
      id: `message-${index}`,
      timestamp: new Date(),
      attempts: 1,
      body,
    })),
  )
  const ctx = createExecutionContext()
  const handler: ExportedHandlerQueueHandler<CloudflareBindings> = worker.queue
  await handler(batch, env, ctx)
  return getQueueResult(batch, ctx)
}
