import type {
  BaseDeliveryJob,
  EmailDeliveryJob,
  PushDeliveryJob,
  TelegramDeliveryJob,
} from '#types/delivery.js'
import { logger } from '#utils/logger.js'
import { handleDlqQueue } from './dlq.js'
import { handleEmailQueue } from './email.js'
import { handleEventIngestionQueue } from './event-ingestion.js'
import { handlePushQueue } from './push.js'
import { handleTelegramQueue } from './telegram.js'

type QueueHandler = (
  batch: MessageBatch,
  env: CloudflareBindings,
) => Promise<void>

/**
 * Production queue bindings, exactly as named in wrangler.jsonc
 * `queues.consumers`.
 */
const handlers: ReadonlyMap<string, QueueHandler> = new Map<
  string,
  QueueHandler
>([
  [
    'app-api-worker-telegram-delivery',
    (batch, env) =>
      handleTelegramQueue(batch as MessageBatch<TelegramDeliveryJob>, env),
  ],
  [
    'app-api-worker-email-delivery',
    (batch, env) =>
      handleEmailQueue(batch as MessageBatch<EmailDeliveryJob>, env),
  ],
  [
    'app-api-worker-push-delivery',
    (batch, env) =>
      handlePushQueue(batch as MessageBatch<PushDeliveryJob>, env),
  ],
  ['app-api-worker-event-ingestion', handleEventIngestionQueue],
  [
    'app-api-worker-dlq',
    (batch, env) => handleDlqQueue(batch as MessageBatch<BaseDeliveryJob>, env),
  ],
])

/**
 * Resolves a staging queue name to the production queue it mirrors —
 * "staging" meaning any non-production deploy: an isolated staging
 * environment (`app-api-worker-staging-…`) or a PR build
 * (`app-api-worker-pr-<N>-…`). Both bind renamed copies of the production
 * queues. Returns `undefined` for a name that is not a staging copy.
 */
export const stagingEquivalent = (queueName: string): string | undefined => {
  const suffix = queueName.match(
    /^app-api-worker-(?:staging|pr-\d+)-(.+)$/,
  )?.[1]
  return suffix === undefined ? undefined : `app-api-worker-${suffix}`
}

const handlerFor = (queueName: string | undefined): QueueHandler | undefined =>
  queueName === undefined ? undefined : handlers.get(queueName)

export const handleQueue = async (
  batch: MessageBatch,
  env: CloudflareBindings,
): Promise<void> => {
  logger.debug('Queue batch received', {
    queue: batch.queue,
    messageCount: batch.messages.length,
  })

  // A production deploy consumes queues under exactly their bound names.
  const production = handlers.get(batch.queue)
  if (production) {
    await production(batch, env)
    return
  }

  // A staging deploy — an isolated staging environment or a PR build —
  // consumes renamed copies of the production queues; resolve each to the
  // production queue it mirrors and route identically.
  const staging = handlerFor(stagingEquivalent(batch.queue))
  if (staging) {
    await staging(batch, env)
    return
  }

  // Neither a production queue nor a staging copy of one: a
  // misconfiguration. Throw rather than silently ack-and-drop the batch —
  // returning here would lose the messages, throwing lets the batch retry
  // and surfaces the error.
  throw new Error(`Unhandled queue: ${batch.queue}`)
}
