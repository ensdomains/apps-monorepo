import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { fromPromise, ok } from 'neverthrow'
import type { ExpiryEvent } from '#types/events/index.js'
import { chunk } from '#utils/chunk.js'
import { logger } from '#utils/logger.js'
import {
  getStageCursor,
  loadNotificationCursors,
  type NotificationCursors,
  storeNotificationCursors,
} from './cursors.js'
import { type ExpiringDomain, fetchPublicationTime } from './indexer.js'
import { reportExpiryTimestampOverflow } from './overflow-alert.js'
import { fetchProcessableExpiringNames } from './page.js'
import {
  type ExpiryStageConfig,
  type ExpiryTrack,
  getLowerBoundForStage,
  getQueryCursorForStage,
  getUpperBoundForStage,
  isNotifiableAtStage,
  TRACKS,
} from './stages.js'

const QUEUE_BATCH_SIZE = 100

class QueuePublishError extends TaggedError('QUEUE_PUBLISH_ERROR')<{
  trackId: string
  stageId: string
}> {}

type StageRunMetrics = {
  trackId: string
  stageId: string
  cursorStart: number
  cursorEnd: number
  upperBound: number
  queryCursor: number
  lowerBound: number
  lagSec: number
  enqueuedCount: number
  pageDomainCount: number
  chunkCount: number
  hasMore: boolean
  overflow: boolean
  firstExpiryDate?: number
  lastExpiryDate?: number
}

function buildExpiryEvents(
  stage: ExpiryStageConfig,
  domains: readonly ExpiringDomain[],
): ExpiryEvent[] {
  return domains
    .filter((domain) => domain.inTrack && isNotifiableAtStage(stage, domain))
    .map((domain) => ({
      type: 'name_expiring',
      name: domain.name,
      expiryDate: domain.expiryDate,
      graceEndDate: domain.graceEndDate,
      stage: stage.id,
      owner: domain.owner,
      includeFavorites: stage.includeFavorites,
    }))
}

const processStage = ResultFn(async function* (ctx: {
  env: CloudflareBindings
  track: ExpiryTrack
  stage: ExpiryStageConfig
  cursor: number
  nowSec: number
}) {
  const upperBound = getUpperBoundForStage(ctx.stage, ctx.track, ctx.nowSec)
  const lowerBound = getLowerBoundForStage(ctx.stage, ctx.track, ctx.nowSec)
  const queryCursor = getQueryCursorForStage(
    ctx.stage,
    ctx.track,
    ctx.cursor,
    ctx.nowSec,
  )
  const clampedBySec = Math.max(0, queryCursor - ctx.cursor)
  const lagSec = Math.max(0, upperBound - queryCursor)

  // Cursor already caught up with the stage window.
  if (queryCursor >= upperBound) {
    logger.debug('Expiry stage skipped (cursor caught up)', {
      trackId: ctx.track.id,
      stageId: ctx.stage.id,
      cursorStart: ctx.cursor,
      queryCursor,
      lowerBound,
      upperBound,
      lagSec,
    })
    return ok({
      trackId: ctx.track.id,
      stageId: ctx.stage.id,
      cursorStart: ctx.cursor,
      cursorEnd: ctx.cursor,
      queryCursor,
      lowerBound,
      upperBound,
      lagSec,
      enqueuedCount: 0,
      pageDomainCount: 0,
      chunkCount: 0,
      hasMore: false,
      overflow: false,
      firstExpiryDate: undefined,
      lastExpiryDate: undefined,
    } satisfies StageRunMetrics)
  }

  if (clampedBySec > 0) {
    logger.warn('Expiry stage cursor clamped to exclusive window', {
      trackId: ctx.track.id,
      stageId: ctx.stage.id,
      cursorStart: ctx.cursor,
      queryCursor,
      lowerBound,
      upperBound,
      clampedBySec,
    })
  }

  logger.debug('Processing expiry stage window', {
    trackId: ctx.track.id,
    stageId: ctx.stage.id,
    cursorStart: ctx.cursor,
    queryCursor,
    lowerBound,
    upperBound,
    lagSec,
  })

  const page = yield* fetchProcessableExpiringNames({
    env: ctx.env,
    track: ctx.track,
    stage: ctx.stage,
    cursor: queryCursor,
    upperBound,
  })

  if (page.overflow) {
    await reportExpiryTimestampOverflow({
      env: ctx.env,
      trackId: ctx.track.id,
      stageId: ctx.stage.id,
      expiryTimestamp: page.overflow.expiryTimestamp,
      processedCount: page.overflow.processedCount,
    })
  }

  if (page.domains.length === 0) {
    logger.debug('Expiry stage returned no domains', {
      trackId: ctx.track.id,
      stageId: ctx.stage.id,
      cursorStart: ctx.cursor,
      queryCursor,
      lowerBound,
      upperBound,
    })
    return ok({
      trackId: ctx.track.id,
      stageId: ctx.stage.id,
      cursorStart: ctx.cursor,
      cursorEnd: page.cursorEnd,
      queryCursor,
      lowerBound,
      upperBound,
      lagSec,
      enqueuedCount: 0,
      pageDomainCount: 0,
      chunkCount: 0,
      hasMore: false,
      overflow: Boolean(page.overflow),
      firstExpiryDate: undefined,
      lastExpiryDate: undefined,
    } satisfies StageRunMetrics)
  }

  const events = buildExpiryEvents(ctx.stage, page.domains)
  const eventChunks = chunk(events, QUEUE_BATCH_SIZE)
  const firstExpiryDate = page.domains[0]?.expiryDate
  const lastExpiryDate = page.domains[page.domains.length - 1]?.expiryDate

  for (const eventChunk of eventChunks) {
    logger.trace('Enqueueing expiry events chunk', {
      trackId: ctx.track.id,
      stageId: ctx.stage.id,
      chunkSize: eventChunk.length,
    })
    // One sendBatch call counts as one subrequest regardless of chunk size.
    yield* fromPromise(
      ctx.env.EVENT_INGESTION_QUEUE.sendBatch(
        eventChunk.map((event) => ({ body: event })),
      ),
      (error) =>
        new QueuePublishError({
          message: `Failed to enqueue expiry events for ${ctx.track.id} stage ${ctx.stage.id}`,
          cause: error,
          trackId: ctx.track.id,
          stageId: ctx.stage.id,
        }),
    )
  }

  return ok({
    trackId: ctx.track.id,
    stageId: ctx.stage.id,
    cursorStart: ctx.cursor,
    cursorEnd: page.cursorEnd,
    queryCursor,
    lowerBound,
    upperBound,
    lagSec,
    enqueuedCount: events.length,
    pageDomainCount: page.domains.length,
    chunkCount: eventChunks.length,
    hasMore: page.hasMore,
    overflow: Boolean(page.overflow),
    firstExpiryDate,
    lastExpiryDate,
  } satisfies StageRunMetrics)
})

const STAGE_RUNS = TRACKS.flatMap((track) =>
  track.stages.map((stage) => ({ track, stage })),
)

export const runExpiryDiscoveryCron = ResultFn(async function* (
  env: CloudflareBindings,
) {
  const startedAt = Date.now()
  const wallClockSec = Math.floor(Date.now() / 1000)
  // Stage windows follow the indexed state, not the wall clock: a row is
  // only judged once bigname's publication has reached its phase.
  const publicationSec = yield* fetchPublicationTime({
    env,
    nowSec: wallClockSec,
  })
  const nowSec = Math.min(wallClockSec, publicationSec)
  logger.info('Expiry discovery cron started', {
    nowSec,
    wallClockSec,
    publicationSec,
    trackCount: TRACKS.length,
    stageRunCount: STAGE_RUNS.length,
    stagesByTrack: Object.fromEntries(
      TRACKS.map((track) => [track.id, track.stages.map((stage) => stage.id)]),
    ),
  })

  const cursors = yield* loadNotificationCursors(env, nowSec)
  logger.debug('Loaded expiry notification cursors', {
    cursors: Object.fromEntries(
      Object.entries(cursors).map(([trackId, stages]) => [
        trackId,
        Object.fromEntries(
          Object.entries(stages).map(([k, v]) => [k, v?.expiry_timestamp]),
        ),
      ]),
    ),
  })

  const stageResults = await Promise.all(
    STAGE_RUNS.map(async ({ track, stage }) => {
      const result = await processStage({
        env,
        track,
        stage,
        cursor: getStageCursor(cursors, track, stage, nowSec),
        nowSec,
      })

      return {
        track,
        stage,
        result,
      }
    }),
  )

  let nextCursors: NotificationCursors = cursors

  let totalEnqueued = 0
  let failedStages = 0
  const stageMetrics: Record<string, StageRunMetrics> = {}

  for (const { track, stage, result } of stageResults) {
    if (result.isErr()) {
      failedStages += 1
      logger.error('Expiry discovery stage failed', {
        trackId: track.id,
        stageId: stage.id,
        cursorStart: getStageCursor(cursors, track, stage, nowSec),
        upperBound: getUpperBoundForStage(stage, track, nowSec),
        error: result.error,
      })
      continue
    }

    // Per-stage commit policy: successful stages move forward even if others fail.
    nextCursors = {
      ...nextCursors,
      [track.id]: {
        ...nextCursors[track.id],
        [stage.id]: { expiry_timestamp: result.value.cursorEnd },
      },
    }
    totalEnqueued += result.value.enqueuedCount
    stageMetrics[`${track.id}/${stage.id}`] = result.value

    logger.info('Expiry discovery stage completed', {
      trackId: track.id,
      stageId: stage.id,
      cursorStart: result.value.cursorStart,
      cursorEnd: result.value.cursorEnd,
      upperBound: result.value.upperBound,
      queryCursor: result.value.queryCursor,
      lowerBound: result.value.lowerBound,
      lagSec: result.value.lagSec,
      cursorAdvancedBySec: result.value.cursorEnd - result.value.cursorStart,
      pageDomainCount: result.value.pageDomainCount,
      firstExpiryDate: result.value.firstExpiryDate,
      lastExpiryDate: result.value.lastExpiryDate,
      enqueuedCount: result.value.enqueuedCount,
      chunkCount: result.value.chunkCount,
      hasMore: result.value.hasMore,
      overflow: result.value.overflow,
    })
  }

  yield* storeNotificationCursors(env, nextCursors)

  const durationMs = Date.now() - startedAt
  const successfulStages = STAGE_RUNS.length - failedStages
  logger.info('Expiry discovery cron completed', {
    durationMs,
    successfulStages,
    totalEnqueued,
    failedStages,
    stageMetrics,
  })

  return ok({
    totalEnqueued,
    failedStages,
  })
})
