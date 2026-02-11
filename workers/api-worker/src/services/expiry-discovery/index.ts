import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { fromPromise, ok } from 'neverthrow'
import type { ExpiryEvent } from '#types/events/index.js'
import { chunk } from '#utils/chunk.js'
import { logger, prettifyError } from '#utils/logger.js'
import {
  loadNotificationCursors,
  storeNotificationCursors,
  type NotificationCursors,
} from './cursors.js'
import { fetchExpiringNamesPage } from './indexer.js'
import { getUpperBoundForStage, STAGES, type ExpiryStageConfig } from './stages.js'

const QUEUE_BATCH_SIZE = 100

class QueuePublishError extends TaggedError('QUEUE_PUBLISH_ERROR')<{
  stageId: string
}> {}

function buildExpiryEvents(stage: ExpiryStageConfig, domains: { name: string; expiryDate: number; owner?: string }[]): ExpiryEvent[] {
  return domains.map((domain) => ({
    type: 'name_expiring',
    name: domain.name,
    expiryDate: domain.expiryDate,
    stage: stage.id,
    owner: domain.owner,
    includeFavorites: stage.includeFavorites,
  }))
}

const processStage = ResultFn(async function* (ctx: {
  env: CloudflareBindings
  stage: ExpiryStageConfig
  cursor: number
  nowSec: number
}) {
  const upperBound = getUpperBoundForStage(ctx.stage, ctx.nowSec)

  if (ctx.cursor >= upperBound) {
    return ok({
      stageId: ctx.stage.id,
      nextCursor: ctx.cursor,
      enqueuedCount: 0,
      hasMore: false,
    })
  }

  const page = yield* fetchExpiringNamesPage({
    env: ctx.env,
    stage: ctx.stage,
    cursor: ctx.cursor,
    upperBound,
  })

  if (page.domains.length === 0) {
    return ok({
      stageId: ctx.stage.id,
      nextCursor: ctx.cursor,
      enqueuedCount: 0,
      hasMore: false,
    })
  }

  const events = buildExpiryEvents(ctx.stage, page.domains)

  for (const eventChunk of chunk(events, QUEUE_BATCH_SIZE)) {
    yield* fromPromise(
      ctx.env.EVENT_INGESTION_QUEUE.sendBatch(
        eventChunk.map((event) => ({ body: event })),
      ),
      (error) =>
        new QueuePublishError({
          message: `Failed to enqueue expiry events for stage ${ctx.stage.id}`,
          cause: error,
          stageId: ctx.stage.id,
        }),
    )
  }

  return ok({
    stageId: ctx.stage.id,
    nextCursor: page.domains[page.domains.length - 1].expiryDate,
    enqueuedCount: events.length,
    hasMore: page.hasMore,
  })
})

export const runExpiryDiscoveryCron = ResultFn(async function* (
  env: CloudflareBindings,
) {
  const nowSec = Math.floor(Date.now() / 1000)
  const cursors = yield* loadNotificationCursors(env, nowSec)

  const stageResults = await Promise.all(
    STAGES.map(async (stage) => {
      const result = await processStage({
        env,
        stage,
        cursor: cursors[stage.id].expiry_timestamp,
        nowSec,
      })

      return {
        stage,
        result,
      }
    }),
  )

  const nextCursors: NotificationCursors = {
    ...cursors,
  }

  let totalEnqueued = 0
  let failedStages = 0

  for (const { stage, result } of stageResults) {
    if (result.isErr()) {
      failedStages += 1
      logger.error('Expiry discovery stage failed', {
        stage: stage.id,
        error: prettifyError(result.error),
      })
      continue
    }

    nextCursors[stage.id] = {
      expiry_timestamp: result.value.nextCursor,
    }
    totalEnqueued += result.value.enqueuedCount

    logger.info('Expiry discovery stage completed', {
      stage: stage.id,
      cursorStart: cursors[stage.id].expiry_timestamp,
      cursorEnd: result.value.nextCursor,
      enqueuedCount: result.value.enqueuedCount,
      hasMore: result.value.hasMore,
    })
  }

  yield* storeNotificationCursors(env, nextCursors)

  return ok({
    totalEnqueued,
    failedStages,
  })
})
