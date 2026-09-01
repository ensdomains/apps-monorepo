import { ResultFn } from '@ens-apps/utils/neverthrow'
import { ok } from 'neverthrow'
import {
  type ExpiringDomain,
  fetchExpiringNamesPage,
  PROCESS_PAGE_SIZE,
} from './indexer.js'
import type { ExpiryStageConfig } from './stages.js'

export type ExpiryTimestampOverflow = {
  expiryTimestamp: number
  processedCount: number
}

export type ProcessableExpiryPage = {
  domains: ExpiringDomain[]
  cursorEnd: number
  hasMore: boolean
  overflow?: ExpiryTimestampOverflow
}

export type NormalExpiryPagePlan =
  | {
      type: 'complete'
      domains: ExpiringDomain[]
      cursorEnd: number
      hasMore: false
    }
  | {
      type: 'safe-boundary'
      domains: ExpiringDomain[]
      cursorEnd: number
      hasMore: true
    }
  | {
      type: 'split-timestamp'
      domainsBeforeT: ExpiringDomain[]
      timestamp: number
    }

export type ExactTimestampPagePlan = {
  domains: ExpiringDomain[]
  overflow: boolean
  cursorEnd: number
}

function lastExpiryDate(
  domains: readonly ExpiringDomain[],
  fallback: number,
): number {
  const lastDomain = domains[domains.length - 1]
  return lastDomain ? lastDomain.expiryDate : fallback
}

/**
 * Decide how to process a normal expiry query page.
 *
 * The indexer is queried with QUERY_PAGE_SIZE (PROCESS_PAGE_SIZE + 1). Row
 * PROCESS_PAGE_SIZE + 1 is lookahead only and must never be processed from
 * this page: either the PROCESS_PAGE_SIZE boundary is safe, or the page
 * splits a shared expiry timestamp and that bucket is re-queried exactly.
 */
export function planNormalExpiryPage(
  domains: readonly ExpiringDomain[],
  queryCursor: number,
): NormalExpiryPagePlan {
  if (domains.length <= PROCESS_PAGE_SIZE) {
    return {
      type: 'complete',
      domains: [...domains],
      cursorEnd: lastExpiryDate(domains, queryCursor),
      hasMore: false,
    }
  }

  const processable = domains.slice(0, PROCESS_PAGE_SIZE)
  const boundary = processable[PROCESS_PAGE_SIZE - 1]
  const lookahead = domains[PROCESS_PAGE_SIZE]

  if (!boundary || !lookahead) {
    return {
      type: 'complete',
      domains: processable,
      cursorEnd: lastExpiryDate(processable, queryCursor),
      hasMore: false,
    }
  }

  if (boundary.expiryDate !== lookahead.expiryDate) {
    return {
      type: 'safe-boundary',
      domains: processable,
      cursorEnd: boundary.expiryDate,
      hasMore: true,
    }
  }

  const timestamp = boundary.expiryDate
  return {
    type: 'split-timestamp',
    domainsBeforeT: processable.filter(
      (domain) => domain.expiryDate < timestamp,
    ),
    timestamp,
  }
}

/**
 * Exact-timestamp follow-up: process up to PROCESS_PAGE_SIZE names at T.
 * A full QUERY_PAGE_SIZE result means overflow — extra names at T are skipped.
 */
export function planExactTimestampPage(
  domains: readonly ExpiringDomain[],
  timestamp: number,
): ExactTimestampPagePlan {
  if (domains.length > PROCESS_PAGE_SIZE) {
    return {
      domains: domains.slice(0, PROCESS_PAGE_SIZE),
      overflow: true,
      cursorEnd: timestamp,
    }
  }

  return {
    domains: [...domains],
    overflow: false,
    cursorEnd: timestamp,
  }
}

export const fetchProcessableExpiringNames = ResultFn(async function* (ctx: {
  env: CloudflareBindings
  stage: ExpiryStageConfig
  cursor: number
  upperBound: number
}) {
  const page = yield* fetchExpiringNamesPage(ctx)
  const plan = planNormalExpiryPage(page.domains, ctx.cursor)

  if (plan.type !== 'split-timestamp') {
    return ok({
      domains: plan.domains,
      cursorEnd: plan.cursorEnd,
      hasMore: plan.hasMore,
      overflow: undefined,
    } satisfies ProcessableExpiryPage)
  }

  const exactPage = yield* fetchExpiringNamesPage({
    env: ctx.env,
    stage: ctx.stage,
    cursor: plan.timestamp - 1,
    upperBound: plan.timestamp,
  })
  const exactPlan = planExactTimestampPage(exactPage.domains, plan.timestamp)

  return ok({
    domains: [...plan.domainsBeforeT, ...exactPlan.domains],
    cursorEnd: exactPlan.cursorEnd,
    hasMore: true,
    overflow: exactPlan.overflow
      ? {
          expiryTimestamp: plan.timestamp,
          processedCount: exactPlan.domains.length,
        }
      : undefined,
  } satisfies ProcessableExpiryPage)
})
