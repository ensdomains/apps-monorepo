import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { err, fromPromise, ok, type Result } from 'neverthrow'
import type { ExpiryEvent } from '#types/events/index.js'
import { chunk } from '#utils/chunk.js'
import { logger } from '#utils/logger.js'
import {
  loadNotificationCursors,
  type NotificationCursors,
  storeNotificationCursors,
} from './cursors.js'
import { fetchIndexedAtSec, fetchIndexReadiness } from './indexer.js'
import { reportExpiryTimestampOverflow } from './overflow-alert.js'
import {
  fetchSweep,
  type ProcessableExpiryPage,
  type StageName,
  type StageWindow,
} from './page.js'
import {
  type ExpiryStageConfig,
  getLowerBoundForStage,
  getQueryCursorForStage,
  getUpperBoundForStage,
  STAGES,
} from './stages.js'

const QUEUE_BATCH_SIZE = 100
// Windows end at the indexed time, so lag only delays reminders; past this
// much it is worth a warning.
const INDEX_LAG_WARN_SECONDS = 60 * 60

class QueuePublishError extends TaggedError('QUEUE_PUBLISH_ERROR')<{
  stageId: string
}> {}

type StageRunMetrics = {
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
  domains: readonly StageName[],
): ExpiryEvent[] {
  return domains.map((domain) => ({
    type: 'name_expiring',
    name: domain.name,
    expiryDate: domain.expiryDate,
    protocol: domain.protocol,
    stage: stage.id,
    owner: domain.owner,
    includeFavorites: stage.includeFavorites,
  }))
}

type StagePlan = StageWindow & {
  readonly cursorStart: number
  readonly lowerBound: number
}

const planStage = (
  stage: ExpiryStageConfig,
  cursorStart: number,
  windowNowSec: number,
): StagePlan => ({
  stage,
  cursorStart,
  cursor: getQueryCursorForStage(stage, cursorStart, windowNowSec),
  upperBound: getUpperBoundForStage(stage, windowNowSec),
  lowerBound: getLowerBoundForStage(stage, windowNowSec),
})

const isOpen = (plan: StagePlan): boolean => plan.cursor < plan.upperBound

const caughtUpMetrics = (plan: StagePlan): StageRunMetrics => ({
  stageId: plan.stage.id,
  cursorStart: plan.cursorStart,
  cursorEnd: plan.cursorStart,
  queryCursor: plan.cursor,
  lowerBound: plan.lowerBound,
  upperBound: plan.upperBound,
  lagSec: Math.max(0, plan.upperBound - plan.cursor),
  enqueuedCount: 0,
  pageDomainCount: 0,
  chunkCount: 0,
  hasMore: false,
  overflow: false,
  firstExpiryDate: undefined,
  lastExpiryDate: undefined,
})

const processStage = ResultFn(async function* (ctx: {
  readonly env: CloudflareBindings
  readonly plan: StagePlan
  readonly page: ProcessableExpiryPage
}) {
  const { plan, page } = ctx
  const { stage } = plan
  const lagSec = Math.max(0, plan.upperBound - plan.cursor)

  if (plan.cursor > plan.cursorStart) {
    logger.warn('Expiry stage cursor clamped to exclusive window', {
      stageId: stage.id,
      cursorStart: plan.cursorStart,
      queryCursor: plan.cursor,
      lowerBound: plan.lowerBound,
      upperBound: plan.upperBound,
      clampedBySec: plan.cursor - plan.cursorStart,
    })
  }

  if (page.overflow) {
    await reportExpiryTimestampOverflow({
      env: ctx.env,
      stageId: stage.id,
      expiryTimestamp: page.overflow.expiryTimestamp,
      processedCount: page.overflow.processedCount,
    })
  }

  const events = buildExpiryEvents(stage, page.domains)
  const eventChunks = chunk(events, QUEUE_BATCH_SIZE)

  for (const eventChunk of eventChunks) {
    logger.trace('Enqueueing expiry events chunk', {
      stageId: stage.id,
      chunkSize: eventChunk.length,
    })
    // One sendBatch call counts as one subrequest regardless of chunk size.
    yield* fromPromise(
      ctx.env.EVENT_INGESTION_QUEUE.sendBatch(
        eventChunk.map((event) => ({ body: event })),
      ),
      (error) =>
        new QueuePublishError({
          message: `Failed to enqueue expiry events for stage ${stage.id}`,
          cause: error,
          stageId: stage.id,
        }),
    )
  }

  return ok({
    stageId: stage.id,
    cursorStart: plan.cursorStart,
    cursorEnd: page.cursorEnd,
    queryCursor: plan.cursor,
    lowerBound: plan.lowerBound,
    upperBound: plan.upperBound,
    lagSec,
    enqueuedCount: events.length,
    pageDomainCount: page.domains.length,
    chunkCount: eventChunks.length,
    hasMore: page.hasMore,
    overflow: Boolean(page.overflow),
    firstExpiryDate: page.domains[0]?.expiryDate,
    lastExpiryDate: page.domains.at(-1)?.expiryDate,
  } satisfies StageRunMetrics)
})

/**
 * The windows were planned at the index position read before the sweep; if a
 * page then came from an older publication, neither the cursor nor the
 * reminders may pass what it saw. Names beyond the cap are read again next run.
 */
const capAtSweepTime = (
  plan: StagePlan,
  page: ProcessableExpiryPage,
  sweepIndexedAtSec: number,
): ProcessableExpiryPage => {
  const cap = Math.max(
    plan.cursorStart,
    getUpperBoundForStage(plan.stage, sweepIndexedAtSec),
  )
  return page.cursorEnd <= cap
    ? page
    : {
        ...page,
        domains: page.domains.filter(({ position }) => position <= cap),
        cursorEnd: cap,
        hasMore: true,
      }
}

export const runExpiryDiscoveryCron = ResultFn(async function* (
  env: CloudflareBindings,
) {
  const startedAt = Date.now()
  const nowSec = Math.floor(Date.now() / 1000)
  logger.info('Expiry discovery cron started', {
    nowSec,
    stageCount: STAGES.length,
    stages: STAGES.map((stage) => stage.id),
  })

  // Notices sent from a stale view could tell a renewed name it expired, so a
  // run waits for a current index and leaves every cursor where it is.
  const readiness = await fetchIndexReadiness(env)
  if (readiness.isErr()) {
    logger.error('Expiry discovery could not read the index status', {
      error: readiness.error,
    })
    return ok({ totalEnqueued: 0, failedStages: STAGES.length })
  }
  if (!readiness.value.isReady) {
    logger.warn('Expiry discovery skipped: the index is not current', {
      reason: readiness.value.reason,
    })
    return ok({ totalEnqueued: 0, failedStages: 0 })
  }

  const cursors = yield* loadNotificationCursors(env, nowSec)
  logger.debug('Loaded expiry notification cursors', {
    cursors: Object.fromEntries(
      Object.entries(cursors).map(([k, v]) => [k, v.expiry_timestamp]),
    ),
  })

  const indexedAt = await fetchIndexedAtSec(env, nowSec)
  if (indexedAt.isErr()) {
    // Without the index position no window can be trusted; every cursor holds.
    logger.error('Expiry discovery could not read the index position', {
      error: indexedAt.error,
    })
    return ok({ totalEnqueued: 0, failedStages: STAGES.length })
  }
  const windowNowSec = Math.min(nowSec, indexedAt.value)
  if (nowSec - indexedAt.value > INDEX_LAG_WARN_SECONDS) {
    logger.warn('Expiry discovery windows capped at the indexed time', {
      nowSec,
      indexedAtSec: indexedAt.value,
      indexLagSec: nowSec - indexedAt.value,
    })
  }

  const plans = STAGES.map((stage) =>
    planStage(stage, cursors[stage.id].expiry_timestamp, windowNowSec),
  )
  const openPlans = plans.filter(isOpen)
  const sweep =
    openPlans.length > 0
      ? await fetchSweep({ env, windows: openPlans })
      : undefined

  const runStage = async (
    plan: StagePlan,
  ): Promise<Result<StageRunMetrics, unknown>> => {
    if (!isOpen(plan)) return ok(caughtUpMetrics(plan))
    // A failed read holds every open stage; nothing was read for any of them.
    if (!sweep || sweep.isErr()) return err(sweep?.error)
    const page = sweep.value.pages.get(plan.stage.id)
    return page
      ? processStage({
          env,
          plan,
          page: capAtSweepTime(plan, page, sweep.value.indexedAtSec),
        })
      : ok(caughtUpMetrics(plan))
  }
  const stageResults = await Promise.all(
    plans.map(async (plan) => ({
      stage: plan.stage,
      result: await runStage(plan),
    })),
  )

  const nextCursors: NotificationCursors = {
    ...cursors,
  }

  let totalEnqueued = 0
  let failedStages = 0
  const stageMetrics: Record<string, StageRunMetrics> = {}

  for (const { stage, result } of stageResults) {
    if (result.isErr()) {
      failedStages += 1
      logger.error('Expiry discovery stage failed', {
        stageId: stage.id,
        cursorStart: cursors[stage.id].expiry_timestamp,
        upperBound: getUpperBoundForStage(stage, nowSec),
        error: result.error,
      })
      continue
    }

    // Per-stage commit policy: successful stages move forward even if others fail.
    nextCursors[stage.id] = {
      expiry_timestamp: result.value.cursorEnd,
    }
    totalEnqueued += result.value.enqueuedCount
    stageMetrics[stage.id] = result.value

    logger.info('Expiry discovery stage completed', {
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
  const successfulStages = STAGES.length - failedStages
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
